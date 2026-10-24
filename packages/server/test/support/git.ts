/** A git repository for a test to read, with an author nobody has to configure. */

import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** Runs git in `cwd` with a fixed author and committer. */
export async function git(cwd: string, ...args: string[]): Promise<void> {
  await exec('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'T',
      GIT_AUTHOR_EMAIL: 't@example.org',
      GIT_COMMITTER_NAME: 'T',
      GIT_COMMITTER_EMAIL: 't@example.org',
    },
  })
}

/** `git init -b main`, writes `files`, commits once, returns the HEAD sha. */
export async function gitRepo(dir: string, files: Record<string, string>): Promise<string> {
  await mkdir(dir, { recursive: true })
  await git(dir, 'init', '-q', '-b', 'main')
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), body)
  }
  await git(dir, 'add', '--', '.')
  await git(dir, 'commit', '-q', '--no-gpg-sign', '-m', 'init')
  const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: dir })
  return stdout.trim()
}
