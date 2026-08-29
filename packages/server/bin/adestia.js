#!/usr/bin/env node
/**
 * The `adestia` command.
 *
 * Deliberately thin: parse a couple of flags, call start(), and translate a
 * failure into a message an operator can act on. Anything smarter belongs in
 * the library, where it can be tested.
 */

import { start } from '../dist/src/start.js'

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

try {
  const instance = await start(configPath ? { configPath } : {})
  const shutdown = async () => {
    await instance.close()
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
