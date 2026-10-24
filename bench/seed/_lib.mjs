/**
 * What the seeds share: writing files the way the product writes them
 * (docs/donnees.md), and nothing that is not a file. A name starting with `_`
 * is not a seed — `--seed` only accepts letters, digits and dashes.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Fixed, so a capture can be compared with the one before it. */
export const BENCH_TOKEN = 'bench-token-0000000000000000'

export async function put(root, relative, contents, mode) {
  const file = join(root, relative)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, contents, mode === undefined ? undefined : { mode })
  return file
}

/** A page: frontmatter between `---` lines, then the body. */
export function page(front, body = '') {
  const lines = Object.entries(front).map(([key, value]) =>
    Array.isArray(value) ? `${key}: [${value.join(', ')}]` : `${key}: ${value}`,
  )
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`
}

/** `userDirectory` of the server: sha256(userId), first 16 hex characters. */
export const userDirectory = (userId) => createHash('sha256').update(userId).digest('hex').slice(0, 16)

let tick = 0
/** Increasing ISO times from a fixed day: the order of a thread is its content. */
export const at = (day, minutes = 0) => new Date(Date.UTC(2026, 9, day, 9, minutes + tick++ % 50)).toISOString()

/**
 * One conversation as `ConversationStore` writes it: a meta line, the messages,
 * and a session line. `owner` is a directory under `<root>/conversations`.
 */
export async function conversation(root, owner, { id, title, updatedAt, archived, messages, session = true }) {
  const lines = [{ type: 'meta', id, title, updatedAt }]
  if (archived) lines.push({ type: 'meta', id, archived: true })
  for (const [index, message] of messages.entries()) {
    lines.push({
      type: 'message',
      id: `${id.slice(0, 24)}-m${String(index).padStart(2, '0')}`,
      at: message.at ?? updatedAt,
      ...message,
    })
  }
  if (session) lines.push({ type: 'session', sessionId: `bench-${id.slice(0, 8)}`, at: updatedAt })
  await put(join(root, 'conversations', owner), `${id}.jsonl`, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}

export const said = (role, text, extra = {}) => ({ role, text, ...extra })

/** A local git repository with one commit: a catalogue the product can clone. */
export async function gitRepo(dir, files) {
  for (const [relative, contents] of Object.entries(files)) await put(dir, relative, contents)
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@invalid', ...args], {
      cwd: dir,
      stdio: 'ignore',
    })
  git('init', '-q', '-b', 'main')
  git('add', '-A')
  git('commit', '-q', '-m', 'bench catalogue')
  return dir
}

/** A 16×12 gradient PNG, a real image so thumbnails go the real way. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAABYUlEQVR42g3LoQ6FIABA0fdh90soFAqFQqFAYG5sjgDFZCKRSCYTiWTyi56nn58TBMEm2AVFcAhOQRN0wRBcglswBUvwCF7Bz0mCZJPskiI5JKekSbpkSC7JLZmSJXkkr/yCIig2xa4oikNxKpqiK4biUtyKqViKR/GqL2iCZtPsmqI5NKemabpmaC7NrZmapXk0r/6CIRg2w24ohsNwGpqhG4bhMtyGaViGx/CaL1iCZbPslmI5LKelWbplWC7LbZmWZXksr/2CIzg2x+4ojsNxOpqjO4bjctyO6ViOx/G6L3iCZ/PsnuI5PKenebpneC7P7Zme5Xk8r/9CJES2yB4pkSNyRlqkR0bkityRGVmRJ/LGLyRCYkvsiZI4EmeiJXpiJK7EnZiJlXgSb/pCJmS2zJ4pmSNzZlqmZ0bmytyZmVmZJ/PmL1RCZavslVI5KmelVXplVK7KXZmVVXkqb+UPtm8A8OtWuzoAAAAASUVORK5CYII=',
  'base64',
)
