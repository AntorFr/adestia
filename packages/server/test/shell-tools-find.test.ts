/**
 * `find_pages` — the tool that answers WHERE, so the agent stops hunting.
 *
 * Every case below is a shape taken from a real transcript, not one imagined
 * here. The agent wrote `grep -ril "piscine\|chlore\|electrolys"` because it
 * was guessing which word a page happens to use; it ran `find -iname "*achat*"`
 * because it did not know the folder; it read an INDEX.md, then grepped, then
 * read again. What the answer must carry is therefore not a list of paths —
 * `grep -l` already gives that — but what each page IS, so the next step is a
 * Read and not another search.
 *
 * The one thing this tool must NOT become is a filesystem API: DESIGN.md
 * refused that, because searching its own memory by CONTENT is the agent's
 * most valuable primitive. Hence the last describe below.
 */

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConversationStore } from '../src/conversations.js'
import { ShellToolsService } from '../src/shell-tools.js'
import { resolveStores, type Store } from '../src/stores.js'

let root: string
let workspace: string
let service: ShellToolsService

const CTX = { userId: 'chloe', conversationId: 'c1' }

const write = async (path: string, front: string, body = '\nCorps.\n') => {
  await mkdir(join(workspace, path, '..'), { recursive: true })
  await writeFile(join(workspace, path), `---\n${front}\n---\n${body}`)
}

const mount = (declared: { id: string; path: string }[] = [{ id: 'perso', path: 'perso' }]) => {
  const stores: readonly Store[] = resolveStores(declared, workspace).stores
  service = new ShellToolsService({
    dataDir: root,
    conversations: new ConversationStore(root),
    stores,
    locale: 'fr',
  })
}

const find = async (args: Record<string, string> = {}) => {
  const outcome = await service.dispatch(CTX, 'find_pages', args)
  if (!outcome.ok) throw new Error(outcome.error)
  return outcome.text
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-find-'))
  workspace = await mkdtemp(join(tmpdir(), 'adestia-find-ws-'))
})

afterEach(async () => {
  await service.close()
})

describe('what a line carries', () => {
  it('says where the page sits AND what it is, so the next step is a Read', async () => {
    await write(
      'perso/maison/piscine/traitement-eau.md',
      'type: fiche\ndomaine: piscine\nstatus: en-cours',
      "\n# Traitement de l'eau\n",
    )
    mount()

    expect(await find({ what: 'piscine' })).toBe(
      '1 page for what=piscine.\nmaison/piscine/traitement-eau.md · Traitement de l\'eau · fiche · piscine · en-cours',
    )
  })

  it('falls back to the heading, then the file name, exactly as the page index does', async () => {
    await write('perso/sujets/porte-manteau.md', 'tags: []', '\n# Porte-manteau de la piscine\n')
    await write('perso/todo/traitement-choc.md', 'type: tache')
    mount()

    const answer = await find({ what: 'piscine' })
    expect(answer).toContain('sujets/porte-manteau.md · Porte-manteau de la piscine')
    expect(answer).not.toContain('traitement-choc')
  })

  it('omits a field the page never declared rather than printing a hole', async () => {
    await write('perso/todo/poollab.md', 'type: tache')
    mount()

    expect(await find({ what: 'poollab' })).toBe('1 page for what=poollab.\ntodo/poollab.md · poollab · tache')
  })
})

describe('finding without knowing the word', () => {
  it('ignores accents and case, both ways', async () => {
    await write('perso/achats/defonceuse.md', 'type: achat\nstatus: idée\ntitle: Défonceuse')
    mount()

    expect(await find({ what: 'DEFONCEUSE' })).toContain('achats/defonceuse.md')
    expect(await find({ status: 'idee' })).toContain('achats/defonceuse.md')
  })

  it('requires every word, so two terms narrow instead of widening', async () => {
    await write('perso/voyages/lisbonne-2026.md', 'type: projet')
    await write('perso/voyages/baden-2026.md', 'type: projet')
    mount()

    expect(await find({ what: 'voyages 2026' })).toContain('2 pages')
    expect(await find({ what: 'voyages lisbonne' })).toBe(
      '1 page for what=voyages lisbonne.\nvoyages/lisbonne-2026.md · lisbonne-2026 · projet',
    )
  })

  it('matches the path and the tags, not only the title', async () => {
    await write('perso/sante/dietetique/plan-75kg.md', 'type: fiche\ntags: [poids, suivi]\ntitle: Plan')
    mount()

    expect(await find({ what: 'dietetique' })).toContain('plan-75kg.md')
    expect(await find({ what: 'suivi' })).toContain('plan-75kg.md')
  })

  it('reads `domaine` as written and `statut` as `status`, because the corpus has both', async () => {
    await write('perso/infra/nas.md', 'type: fiche\ndomaine: infra\nstatut: clos')
    mount()

    expect(await find({ domain: 'infra' })).toContain('infra/nas.md')
    expect(await find({ status: 'clos' })).toContain('infra/nas.md')
  })
})

describe('crossing and widening filters', () => {
  it('crosses type, domain and status with AND', async () => {
    await write('perso/diy/etabli.md', 'type: projet\ndomaine: diy\nstatus: en-cours')
    await write('perso/diy/rabot.md', 'type: machine\ndomaine: diy\nstatus: en-cours')
    await write('perso/achats/scie.md', 'type: projet\ndomaine: achats\nstatus: clos')
    mount()

    expect(await find({ type: 'projet', domain: 'diy' })).toBe(
      '1 page for type=projet, domain=diy.\ndiy/etabli.md · etabli · projet · diy · en-cours',
    )
  })

  it('takes several values comma-separated, so one call answers what two would', async () => {
    await write('perso/a.md', 'type: projet\nstatus: en-cours')
    await write('perso/b.md', 'type: projet\nstatus: veille')
    await write('perso/c.md', 'type: projet\nstatus: clos')
    mount()

    const answer = await find({ status: 'en-cours, veille' })
    expect(answer).toContain('2 pages')
    expect(answer).not.toContain('c.md')
  })
})

describe('several stores', () => {
  it('names the store of every line when the answer mixes them', async () => {
    await write('perso/voyages/lisbonne.md', 'type: projet')
    await write('famille/voyages/colo.md', 'type: projet')
    mount([{ id: 'perso', path: 'perso' }, { id: 'famille', path: 'famille' }])

    const answer = await find({ what: 'voyages' })
    expect(answer).toContain('[perso] voyages/lisbonne.md')
    expect(answer).toContain('[famille] voyages/colo.md')
  })

  it('hoists the store into the header when every page comes from one', async () => {
    await write('perso/achats/scie.md', 'type: achat')
    await write('perso/achats/rabot.md', 'type: achat')
    await write('famille/voyages/colo.md', 'type: projet')
    mount([{ id: 'perso', path: 'perso' }, { id: 'famille', path: 'famille' }])

    expect(await find({ type: 'achat' })).toBe(
      [
        '2 pages for type=achat in perso.',
        'achats/rabot.md · rabot · achat',
        'achats/scie.md · scie · achat',
      ].join('\n'),
    )
  })

  it('restricts to one store, and refuses a store it does not carry by name', async () => {
    await write('perso/voyages/lisbonne.md', 'type: projet')
    await write('famille/voyages/colo.md', 'type: projet')
    mount([{ id: 'perso', path: 'perso' }, { id: 'famille', path: 'famille' }])

    expect(await find({ store: 'famille' })).not.toContain('lisbonne')

    const outcome = await service.dispatch(CTX, 'find_pages', { store: 'boulot' })
    expect(outcome).toEqual({
      ok: false,
      error: 'no store named "boulot" — this instance carries: perso, famille',
    })
  })
})

describe('an answer that stays cheaper than the hunt it replaces', () => {
  it('caps the listing and says what would narrow it', async () => {
    for (let index = 0; index < 75; index += 1) {
      await write(`perso/notes/n${String(index).padStart(2, '0')}.md`, 'type: fiche')
    }
    mount()

    const answer = await find({})
    expect(answer.split('\n')).toHaveLength(61)
    expect(answer.split('\n')[0]).toBe('75 pages, first 60 — narrow with type, domain or status.')
  })

  it('orders by path, so a folder arrives in one block', async () => {
    await write('perso/voyages/b.md', 'type: projet')
    await write('perso/achats/a.md', 'type: achat')
    await write('perso/voyages/a.md', 'type: projet')
    mount()

    expect((await find({})).split('\n').slice(1).map((line) => line.split(' ·')[0])).toEqual([
      'achats/a.md',
      'voyages/a.md',
      'voyages/b.md',
    ])
  })
})

describe('what it refuses to be', () => {
  it('sends a search for CONTENT back to Grep, because that primitive is not ours', async () => {
    await write('perso/maison/chaudiere.md', 'type: fiche', '\nLe brûleur est encrassé.\n')
    mount()

    expect(await find({ what: 'brûleur' })).toBe(
      'No page matches for what=brûleur. Nothing was searched INSIDE the pages — for that, Grep.',
    )
  })

  it('answers plainly when the instance has no memory at all', async () => {
    service = new ShellToolsService({ dataDir: root, conversations: new ConversationStore(root) })
    expect(await find({ what: 'piscine' })).toBe('This instance carries no memory to search.')
  })
})
