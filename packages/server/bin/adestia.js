#!/usr/bin/env node
/**
 * The `adestia` command.
 *
 * Deliberately thin: parse a couple of flags, call start(), and translate a
 * failure into a message an operator can act on. Anything smarter belongs in
 * the library, where it can be tested.
 *
 * The one thing it owns beyond that is the BOOT LOOP. `start()` builds one
 * instance and hands back something that closes; this file decides whether a
 * new one follows, which is what turns the settings screen's restart button
 * into something other than a quit button. Nothing exits: the instance is
 * closed and a new one is started in this same process, so the container, the
 * pod or the terminal that launched us never notices.
 */

import { loadConfigFile, start } from '../dist/src/start.js'

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`adestia — a chat and apps interface on top of a coding-agent CLI

Usage: adestia [options]

Options:
  -c, --config <path>   configuration file (default: adestia.config.yaml)
  -h, --help            show this message

With no configuration file, Adestia runs a single-user instance on
http://127.0.0.1:8730 with no authentication. See adestia.config.example.yaml.`)
  process.exit(0)
}

const flagIndex = Math.max(args.indexOf('--config'), args.indexOf('-c'))
const configPath = flagIndex === -1 ? undefined : args[flagIndex + 1]

if (flagIndex !== -1 && !configPath) {
  console.error('adestia: --config needs a path')
  process.exit(2)
}

const options = configPath ? { configPath } : {}

/** The instance currently serving, or undefined between two of them. */
let instance
/** A restart already under way, so a double click is one restart. */
let cycling = false
/** Set by SIGTERM, so a restart racing a shutdown does not resurrect us. */
let stopping = false

const boot = () => start({ ...options, restart: requestRestart })

/**
 * Closes the instance and starts a new one, here, in this process.
 *
 * The config is PARSED FIRST, before anything is torn down. The file is
 * hand-editable and the settings screen writes it, so the realistic way to
 * reach this function is straight after an edit — and an edit that no longer
 * parses must cost the restart, never the instance that is serving. Refusing
 * while still up is recoverable; discovering it after `close()` is not.
 */
async function requestRestart() {
  if (cycling || stopping) return
  cycling = true
  try {
    if (configPath) {
      try {
        await loadConfigFile(configPath)
      } catch (error) {
        console.error(`adestia: refusing to restart — ${error.message}`)
        return
      }
    }

    console.log('adestia: restarting')
    const previous = instance
    instance = undefined
    await previous?.close()

    // The port needs a moment to come back on a busy machine, and that is the
    // only failure worth retrying: everything else has already been ruled out
    // by the parse above.
    for (let attempt = 1; ; attempt += 1) {
      if (stopping) return
      try {
        instance = await boot()
        return
      } catch (error) {
        if (attempt >= 5) {
          // Nothing is serving and nothing here can fix it. Exiting non-zero
          // is the honest end: a supervisor takes over, and a terminal shows
          // the reason instead of a process that is up and answering nothing.
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
  // The operator gets the reason, not a stack trace: config and extension
  // errors already carry a full explanation of what to fix.
  console.error(`adestia: ${error.message}`)
  process.exit(1)
}
