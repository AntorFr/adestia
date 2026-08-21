# Spike 4 — parallel turns on one subscription

**Date:** 2026-08-21 · **Method:** 27 real micro-turns against a live Claude
subscription (25 Haiku, 2 Opus), `@anthropic-ai/claude-agent-sdk` 0.3.237, bare
temp workdir, `maxTurns: 1`, prompt "Reply with exactly: OK". Sweep of
simultaneous bursts N ∈ {1, 2, 3, 4, 6, 8} with per-turn timing and process
sampling. Raw data in `out/results.json`; harness in `run.mjs`.

## Verdict

**`maxConcurrentTurns: 3` stays the default, and the reason is memory, not the
API.** Every turn succeeded at every concurrency up to 8 — no rate-limit
rejection, no warning, no serialization, no session-store corruption. The
binding constraint is ~300 MB of RSS per CLI process; the second cost is a
one-time ~+1.3 s of time-to-first-token as soon as ANY concurrency exists.
Operators with RAM can raise the cap to 8 knowing it was measured safe; the
refuse-don't-queue design stands.

## Measured

| N | ok | batch wall | mean turn | mean spawn | mean TTFT | parallelism |
|---|----|-----------:|----------:|-----------:|----------:|------------:|
| 1 | 1/1 | 2.3 s | 2.3 s | 0.67 s | 1.75 s | 1.00 |
| 2 | 2/2 | 4.9 s | 3.8 s | 0.64 s | 3.24 s | 1.52 |
| 3 | 3/3 | 4.7 s | 3.5 s | 0.69 s | 3.05 s | 2.25 |
| 4 | 4/4 | 4.9 s | 3.5 s | 0.73 s | 3.03 s | 2.87 |
| 6 | 6/6 | 4.9 s | 3.6 s | 0.92 s | 3.09 s | 4.35 |
| 8 | 8/8 | 5.0 s | 3.9 s | 1.02 s | 3.40 s | 6.20 |

*Parallelism = Σ(turn wall) / batch wall: 1.0 would mean fully serialized, N a
perfect overlap.*

1. **Turns genuinely overlap.** Parallelism reaches 6.2 at N=8 (~78%
   efficiency). Nothing in `~/.claude`, the session store or the binary
   serializes concurrent `query()` calls. A batch of 8 completes in barely
   more wall time than a batch of 2.
2. **The latency cost is a step, then a plateau.** A lone warm turn reaches
   first token in ~1.75 s. The moment two or more run, TTFT sits at
   3.0–3.4 s — and stays there from N=2 through N=8. Concurrency has an
   entry fee, not an escalating one: a person typing while a scheduled turn
   runs waits ~3 s for the first token instead of ~1.8 s, and adding more
   background work barely moves that.
3. **Spawn degrades gently:** 0.64 s at N=2 → 1.02 s at N=8 (+59%). Real but
   minor next to TTFT.
4. **Memory is the constraint that sizes the box.** Process count rose by
   exactly one per concurrent turn, and RSS deltas between bursts put one CLI
   at **≈ 285–320 MB**. Cap 3 ≈ 0.9 GB of CLI processes on top of the server;
   cap 8 ≈ 2.3 GB. This, not the API, is what a container's memory line must
   budget for.
5. **The subscription did not blink.** All 27 turns reported
   `status: "allowed"` on the `five_hour` window; the `utilization` field was
   never populated and no `allowed_warning` appeared. A realistic burst of
   interface traffic is nowhere near the reporting granularity of the window.
6. **Parallel turns share the prompt cache — perfectly.** After one warm-up
   wrote the 26 361-token system-prompt cache, all 24 sweep turns (including
   8 simultaneous) read it: `cache_write: 0, cache_read: 26 361` across the
   board. A cold burst does NOT pay N× the system prompt.
7. **Switching models is the expensive event.** The Opus probe paid a full
   29 251-token cache write: a different model is a different cache. An
   instance that flip-flops models per message re-pays the system prompt on
   every switch — worth knowing before exposing the model selector as a toy.

## What this changes in Golem

- `maxConcurrentTurns: 3` default **confirmed**, with its justification now
  measured instead of guessed (memory-bound; API verified safe to 8).
- The config example documents the ~300 MB/turn sizing rule.
- No code change needed: refuse-don't-queue at the cap was the right shape —
  nothing in the data suggests queueing would ever be safer than refusing.

## Honest limits

One machine, one account, one evening, micro-answers. This measures
concurrency **mechanics** — overlap, latency, memory, cache — not sustained
quota depletion: the `utilization` field never populated, so per-turn window
impact is below reporting granularity and a day of heavy real turns may
behave differently. RSS was sampled amid ambient Claude processes on a dev
machine; the per-process figure comes from deltas between bursts, which are
clean, while absolute totals are not. Opus data is n=2.
