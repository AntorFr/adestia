import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

/** Playwright belongs to the environment, under the image's root or npm's global root. */
export function loadPlaywright() {
  const roots = ['/usr/lib/node_modules']
  try {
    roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim())
  } catch {
    // no npm on the path: the fixed root is all there is
  }
  for (const dir of roots) {
    for (const name of ['playwright-core', 'playwright']) {
      try {
        return createRequire(`${dir}/`)(name)
      } catch {
        // not under this root
      }
    }
  }
  throw new Error(`playwright not found under ${roots.join(' or ')}`)
}
