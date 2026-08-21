/**
 * Spike 4 — parallel turns against a real Claude subscription.
 *
 * The question: what should `maxConcurrentTurns` default to, and what actually
 * happens when several turns run at once on one subscription? Everything the
 * driver reports is measured, nothing is assumed:
 *
 *  - do parallel query() calls truly overlap, or does something serialize them
 *    (a lock in ~/.claude, the session store, the binary itself)?
 *  - how do spawn time, time-to-first-token and total wall degrade with N?
 *  - what does the rate-limit signal look like per turn, and how much of the
 *    5-hour window does a burst actually consume?
 *  - what does each CLI process cost in memory while a burst is running?
 *
 * Deliberately SEQUENTIAL as a protocol: concurrency is the variable under
 * test, so the harness must own it — measurements taken while something else
 * burns the same quota are measurements of nothing.
 *
 * Cost control: every sweep turn is pinned to Haiku with a reply-two-letters
 * prompt and maxTurns: 1. Two Opus micro-turns run at the end, sequentially,
 * only to compare per-turn window impact across tiers. Expected total: ~27
 * micro-turns, almost all Haiku.
 */

import { exec } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { query } from '@anthropic-ai/claude-agent-sdk'

const execAsync = promisify(exec)

const HAIKU = 'claude-haiku-4-5-20251001'
const OPUS = 'claude-opus-5'
const PROMPT = 'Reply with exactly: OK'
const TURN_TIMEOUT_MS = 180_000

/** A bare workdir: no skills, no plugins, nothing to load but the harness. */
const workdir = mkdtempSync(join(tmpdir(), 'golem-spike4-'))

/** One measured turn. Returns everything the stream told us, with timings. */
async function measuredTurn(label, model) {
  const t0 = performance.now()
  const record = {
    label,
    model,
    startedAt: Date.now(),
    initMs: null, // system/init message seen
    ttftMs: null, // first text delta
    wallMs: null,
    resultDurationMs: null,
    resultApiMs: null,
    resultTtftMs: null,
    usage: null,
    rateLimit: null,
    text: '',
    error: null,
  }

  const q = query({
    prompt: PROMPT,
    options: { cwd: workdir, model, maxTurns: 1, includePartialMessages: true },
  })

  const timeout = setTimeout(() => {
    record.error = `timeout after ${TURN_TIMEOUT_MS}ms`
    void q.interrupt().catch(() => undefined)
  }, TURN_TIMEOUT_MS)

  try {
    for await (const message of q) {
      const now = performance.now() - t0
      if (message.type === 'system' && record.initMs === null) record.initMs = now
      if (
        message.type === 'stream_event' &&
        message.event?.type === 'content_block_delta' &&
        message.event.delta?.type === 'text_delta'
      ) {
        if (record.ttftMs === null) record.ttftMs = now
        record.text += message.event.delta.text ?? ''
      }
      if (message.type === 'rate_limit_event') {
        // Keep the LAST one of the turn: it reflects the turn's own impact.
        record.rateLimit = message.rate_limit_info
      }
      if (message.type === 'result') {
        record.resultDurationMs = message.duration_ms ?? null
        record.resultApiMs = message.duration_api_ms ?? null
        record.resultTtftMs = message.ttft_ms ?? null
        record.usage = message.usage ?? null
        if (message.is_error) record.error = String(message.result ?? 'result marked as error')
      }
    }
  } catch (error) {
    record.error = error.message
  } finally {
    clearTimeout(timeout)
    record.wallMs = performance.now() - t0
  }
  return record
}

/** Sum of RSS (MB) of every claude-agent-sdk process alive right now. */
async function claudeRssMb() {
  try {
    const { stdout } = await execAsync("ps -axo rss=,command= | grep -i 'claude' | grep -v grep")
    let kb = 0
    let count = 0
    for (const line of stdout.split('\n')) {
      if (!/claude-agent-sdk|\/claude( |$)/.test(line)) continue
      const rss = Number.parseInt(line.trim().split(/\s+/)[0] ?? '0', 10)
      if (Number.isFinite(rss) && rss > 0) {
        kb += rss
        count += 1
      }
    }
    return { count, totalMb: Math.round(kb / 1024) }
  } catch {
    return { count: 0, totalMb: 0 }
  }
}

/** N simultaneous turns, with process sampling while they run. */
async function burst(n) {
  console.log(`\n=== burst N=${n} (haiku) ===`)
  const samples = []
  const sampler = setInterval(() => {
    void claudeRssMb().then((sample) => samples.push(sample))
  }, 1000)

  const t0 = performance.now()
  const turns = await Promise.all(
    Array.from({ length: n }, (_, index) => measuredTurn(`burst${n}-${index}`, HAIKU)),
  )
  const batchWallMs = performance.now() - t0
  clearInterval(sampler)

  const ok = turns.filter((turn) => !turn.error && turn.text.includes('OK')).length
  const sumWall = turns.reduce((total, turn) => total + turn.wallMs, 0)
  const peak = samples.reduce(
    (best, sample) => (sample.totalMb > best.totalMb ? sample : best),
    { count: 0, totalMb: 0 },
  )

  // Parallelism factor: 1.0 = fully serialized, N = perfect overlap.
  const parallelism = sumWall / Math.max(batchWallMs, 1)

  const summary = {
    n,
    ok,
    failed: n - ok,
    batchWallMs: Math.round(batchWallMs),
    meanWallMs: Math.round(sumWall / n),
    meanInitMs: Math.round(turns.reduce((t, x) => t + (x.initMs ?? 0), 0) / n),
    meanTtftMs: Math.round(turns.reduce((t, x) => t + (x.ttftMs ?? 0), 0) / n),
    maxWallMs: Math.round(Math.max(...turns.map((turn) => turn.wallMs))),
    parallelism: Math.round(parallelism * 100) / 100,
    peakProcesses: peak.count,
    peakRssMb: peak.totalMb,
    rateLimits: turns.map((turn) => turn.rateLimit).filter(Boolean),
    errors: turns.filter((turn) => turn.error).map((turn) => ({ label: turn.label, error: turn.error })),
  }
  console.log(JSON.stringify(summary, null, 2))
  return { summary, turns }
}

const out = { startedAt: new Date().toISOString(), workdir, phases: {} }

// Phase A — one warm-up turn: baseline utilization, cold-cache cost.
console.log('=== warmup (haiku) ===')
const warmup = await measuredTurn('warmup', HAIKU)
console.log(
  JSON.stringify(
    {
      wallMs: Math.round(warmup.wallMs),
      initMs: Math.round(warmup.initMs ?? -1),
      ttftMs: Math.round(warmup.ttftMs ?? -1),
      text: warmup.text.slice(0, 20),
      rateLimit: warmup.rateLimit,
      usage: warmup.usage,
      error: warmup.error,
    },
    null,
    2,
  ),
)
out.phases.warmup = warmup

// Phase B — the sweep. Ascending, so early failures spare the rest.
out.phases.sweep = []
for (const n of [1, 2, 3, 4, 6, 8]) {
  out.phases.sweep.push(await burst(n))
}

// Phase C — two sequential Opus micro-turns: per-tier window impact.
console.log('\n=== opus probes (sequential) ===')
out.phases.opus = []
for (let index = 0; index < 2; index += 1) {
  const probe = await measuredTurn(`opus-${index}`, OPUS)
  console.log(
    JSON.stringify(
      {
        wallMs: Math.round(probe.wallMs),
        ttftMs: Math.round(probe.ttftMs ?? -1),
        rateLimit: probe.rateLimit,
        error: probe.error,
      },
      null,
      2,
    ),
  )
  out.phases.opus.push(probe)
}

writeFileSync(
  new URL('./out/results.json', import.meta.url),
  JSON.stringify(out, null, 2),
)
console.log('\nresults written to out/results.json')
