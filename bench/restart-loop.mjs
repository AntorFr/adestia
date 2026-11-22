#!/usr/bin/env node
/**
 * The boot loop of packages/server/bin/adestia.js, with the scripted engine behind it.
 *
 * `launch.mjs --restart` needs `/api/restart` to really restart the instance, and a seed's `ready` needs turns that
 * STAY running (the restart is refused while one runs, B-plugins-3). The plain binary cannot give both: its driver is
 * the real Claude one, and a turn it starts ends by itself — failing on the bench's token — after a time that depends
 * on the machine's load, so "a turn is running" was true or false by chance. Here the same cycle (parse the config
 * first, close, start a new instance in this process, retry the port) runs with `start({ driverFactory })`, so the
 * held turn is held until it is stopped and a restart ends it, as it would a real one.
 *
 *   node bench/restart-loop.mjs --config <path> --seed-file <path>
 */
import { join } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createFakeEngine } from './fake-engine.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const arg = (name) => argv[argv.indexOf(name) + 1]
const configPath = arg('--config')
const seedModule = await import(pathToFileURL(arg('--seed-file')).href)
const { loadConfigFile, start } = await import(pathToFileURL(join(here, '..', 'packages/server/dist/src/start.js')).href)

let instance
let cycling = false
let stopping = false

const boot = () =>
  start({
    configPath,
    driverFactory: () => createFakeEngine({ scripts: seedModule.scripts ?? [], ...(seedModule.engine ?? {}) }),
    restart: requestRestart,
  })

async function requestRestart() {
  if (cycling || stopping) return
  cycling = true
  try {
    try {
      await loadConfigFile(configPath)
    } catch (error) {
      console.error(`adestia: refusing to restart — ${error.message}`)
      return
    }
    console.log('adestia: restarting')
    const previous = instance
    instance = undefined
    await previous?.close()
    for (let attempt = 1; ; attempt += 1) {
      if (stopping) return
      try {
        instance = await boot()
        return
      } catch (error) {
        if (attempt >= 5) {
          console.error(`adestia: could not restart — ${error.message}`)
          process.exit(1)
        }
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt))
      }
    }
  } finally {
    cycling = false
  }
}

try {
  instance = await boot()
  const shutdown = async () => {
    stopping = true
    await instance?.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
} catch (error) {
  console.error(`adestia: ${error.message}`)
  process.exit(1)
}
