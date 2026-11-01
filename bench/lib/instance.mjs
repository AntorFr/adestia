import { spawn } from 'node:child_process'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

const launcher = fileURLToPath(new URL('../launch.mjs', import.meta.url))

/** The sweep chooses skin/locale; the seed checker uses its own diagnostic error class. */
export function launch(seed, { skin, locale, ErrorClass = Error } = {}) {
  const args = [launcher, '--engine', 'fake', '--seed', seed]
  if (skin) args.push('--skin', skin)
  if (locale) args.push('--locale', locale)
  const child = spawn(execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => (stderr += chunk))
  const url = new Promise((resolve, reject) => {
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
      const found = /listening on (\S+)/.exec(out)
      if (found) resolve(found[1])
    })
    child.once('exit', (code) => reject(new ErrorClass(`the launcher exited (${code}) before answering: ${stderr.trim().split('\n').slice(-3).join(' | ')}`)))
  })
  const stop = () =>
    new Promise((done) => {
      if (child.exitCode !== null) return done()
      child.once('exit', done)
      child.kill('SIGTERM')
    })
  return { url, stop }
}
