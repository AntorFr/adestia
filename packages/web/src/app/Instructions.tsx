/**
 * The instruction zone, as a screen you can browse.
 *
 * Plain text, deliberately, and this is a design position rather than a corner
 * cut. Pages go through a closed grammar with a validator, because a page is
 * rendered by this product and must stay inside a vocabulary the renderer
 * knows. An instruction is read by a CLI: its frontmatter, its code fences and
 * its exact whitespace are the CLI's business, and normalizing them through a
 * grammar built for something else would quietly rewrite a file whose meaning
 * lives in bytes we do not own. So it is saved exactly as typed.
 *
 * Three things changed the day this stopped being a list beside a box.
 *
 * **A card per instruction, and a field to search them.** The split pane was
 * built for the four files a fresh instance has. A real one has thirty — a
 * driver's own conventions, a folder of skills, whatever somebody asked the
 * agent to write down — and a column of file names is unreadable at thirty
 * and unusable at a hundred.
 *
 * **What the product delivers is SHOWN, and cannot be saved.** It used to be
 * filtered out entirely, which meant the screen answered "what is this agent
 * reading?" with half the truth — on an instance whose behaviour comes mostly
 * from plugin contracts, somebody hunting for the rule that made the agent do
 * something could not find it, because it was not theirs. So it is here, said
 * to be delivered, and drawn without a Save. The server refuses the write in
 * any case: an edit that the next restart throws away is worth refusing twice.
 *
 * **And the cards are GROUPED by when the engine reads them.** Thirty cards
 * in one grid gave a standing brief, a skill nothing has matched yet and a
 * subagent's charter exactly the same weight, when the difference between
 * them is the first thing anybody needs: `CLAUDE.md` is in front of the model
 * on every turn, a skill is not there until a task fits its description. The
 * group headings keep the ENGINE's own words — `skills`, `agents` — because
 * those words are on the folder and in the file the reader is about to open,
 * and a translated heading over an untranslated path is one more thing to
 * reconcile. The line under each heading carries the meaning, and it IS
 * translated.
 *
 * A group with nothing in it does not draw: Codex has skills and no subagent
 * folder, and a heading over an empty list reads as a feature that is broken
 * rather than one this engine does not have. Neither do the headings when
 * only one group has anything — on a fresh instance that is a lone
 * `CLAUDE.md` under a heading repeating the screen's own title.
 */

import { useCallback, useState } from 'react'

import { CataloguePopin } from './CataloguePopin'
import { EmptyState } from './ui/index.js'
import { InstructionEditor } from './instructions/InstructionEditor'
import { InstructionList } from './instructions/InstructionList'
import { NamePrompt } from './instructions/NamePrompt'
import { NEW, seedFor, slug, type InstructionPath, type Kind } from './instructions/model'
import { useInstructionList, useInstructionText } from './instructions/useInstructions'

// The pure helpers keep their old address: callers and tests import them here.
export { label, matches, title } from './instructions/model'

export interface InstructionsProps {
  /** The instruction whose text is open, from the address. */
  readonly open?: string | undefined
  readonly onOpen: (path: string | undefined) => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
  readonly locale?: string
}

/** A folder asked for a new one, and which kind it holds: the name is still to come. */
interface Naming {
  readonly place: InstructionPath
  readonly holds: Kind
}

export function Instructions({ open, onOpen, fetchImpl = fetch, t = (key) => key, locale }: InstructionsProps) {
  const { files, places, supported, reload, announce } = useInstructionList(fetchImpl, t)
  /**
   * A file being written for the first time, and its opening text.
   *
   * Held here rather than fetched: there is nothing on disk to fetch yet, and
   * a 404 on the way in would blank the very seed that makes a new skill a
   * skill instead of an empty box.
   */
  const [seed, setSeed] = useState<{ path: string; text: string } | undefined>()
  const [catalogues, setCatalogues] = useState(false)
  const [naming, setNaming] = useState<Naming | undefined>()
  const document_ = useInstructionText(open, seed, useCallback(() => setSeed(undefined), []), fetchImpl, t)

  const start = (path: string, kind: Kind, text = '') => {
    setSeed({ path, text })
    announce(path, kind)
    onOpen(path)
  }

  /** The driver said where a new one goes; inventing it is how a subagent ended up at `agents/x/SKILL.md`. */
  const create = (name: string) => {
    if (!naming) return
    const id = slug(name)
    setNaming(undefined)
    if (!id) return
    const entry = naming.place.entry ?? '<name>/SKILL.md'
    start(`${naming.place.path}/${entry.replace('<name>', id)}`, naming.holds, seedFor(naming.holds, id, name))
  }

  if (!supported) {
    return <EmptyState icon="book-open" text={t('This engine keeps its instructions elsewhere.')} />
  }

  if (open !== undefined) {
    return (
      <InstructionEditor
        open={open}
        shown={files?.find((file) => file.path === open)}
        text={document_.text}
        dirty={document_.dirty}
        save={document_.save}
        onEdit={document_.edit}
        onSave={() => void document_.commit()}
        t={t}
      />
    )
  }

  return (
    <>
      <InstructionList
        files={files}
        places={places}
        locale={locale}
        onOpen={onOpen}
        onStart={(path, kind) => start(path, kind)}
        onCreate={(place, holds) => setNaming({ place, holds })}
        onCatalogues={() => setCatalogues(true)}
        t={t}
      />
      {naming && <NamePrompt question={t(NEW[naming.holds].ask)} onName={create} onCancel={() => setNaming(undefined)} t={t} />}
      {catalogues && (
        <CataloguePopin
          fetchImpl={fetchImpl}
          t={t}
          onClose={() => setCatalogues(false)}
          onChanged={() => void reload()}
        />
      )}
    </>
  )
}
