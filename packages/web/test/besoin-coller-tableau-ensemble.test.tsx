// @vitest-environment jsdom
/**
 * E-16 · B-paste-1 (P-2 step 7) — spreadsheet paste into the composer, from the need only.
 * The composer is the real one; the clipboard is what Excel puts there (text, HTML, picture).
 * Expected values are written by hand from B-paste-1.
 */
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Composer } from '../src/chat/Composer.js'

afterEach(cleanup)

const png = () => new File(['x'], 'selection.png', { type: 'image/png' })
const clip = (files: File[], data: Record<string, string>) => ({ files, getData: (t: string) => data[t] ?? '' })

function paste(area: HTMLElement, clipboardData: unknown) {
  const event = createEvent.paste(area)
  Object.defineProperty(event, 'clipboardData', { value: clipboardData })
  fireEvent(area, event)
  return event
}

function setup() {
  const fetchImpl = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ attachments: [{ id: 'a1', name: 'selection.png' }] }) } as unknown as Response),
  )
  render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} folded={false} fetchImpl={fetchImpl as unknown as typeof fetch} />)
  return { area: screen.getByRole('textbox') as HTMLTextAreaElement, fetchImpl }
}

async function pasteWithImage(data: Record<string, string>, expected: string) {
  const { area, fetchImpl } = setup()
  const event = paste(area, clip([png()], data))
  await waitFor(() => expect(area.value).toBe(expected))
  expect(event.defaultPrevented).toBe(true)
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(screen.queryByText('selection.png')).toBeNull()
}

describe('B-paste-1 nominal', () => {
  it('excel_cellules_html_plus_image_donnent_tableau_markdown_sans_piece_jointe', async () => {
    await pasteWithImage(
      {
        'text/html': '<table><tr><td>Fruit</td><td>Prix</td></tr><tr><td>Pomme</td><td>2</td></tr><tr><td>Poire</td><td>3</td></tr></table>',
        'text/plain': 'Fruit\tPrix\nPomme\t2\nPoire\t3',
      },
      '| Fruit | Prix |\n| --- | --- |\n| Pomme | 2 |\n| Poire | 3 |',
    )
  })

  it('texte_tabule_seul_plus_image_donne_tableau_markdown', async () => {
    await pasteWithImage({ 'text/plain': 'a\tb\tc\n1\t2\t3\r\n' }, '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |')
  })

  it('capture_seule_reste_attachee_et_ne_met_aucun_texte', async () => {
    const { area, fetchImpl } = setup()
    paste(area, clip([png()], {}))
    await waitFor(() => expect(screen.getByText('selection.png')).toBeTruthy())
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(area.value).toBe('')
  })
})

describe('B-paste-1 bords', () => {
  it('une_seule_ligne_est_insere_telle_quelle', async () => {
    await pasteWithImage({ 'text/html': '<table><tr><td>a</td><td>b</td></tr></table>', 'text/plain': 'a\tb' }, 'a\tb')
  })

  it('une_seule_colonne_est_inseree_telle_quelle', async () => {
    await pasteWithImage({ 'text/html': '<table><tr><td>a</td></tr><tr><td>b</td></tr></table>', 'text/plain': 'a\nb' }, 'a\nb')
  })

  it('texte_ordinaire_avec_image_est_insere_tel_quel', async () => {
    await pasteWithImage({ 'text/plain': 'bonjour tout le monde' }, 'bonjour tout le monde')
  })

  it('html_sans_table_donne_son_texte', async () => {
    await pasteWithImage({ 'text/html': '<p>un <b>mot</b></p>' }, 'un mot')
  })

  it('html_sans_table_avec_text_plain_donne_le_text_plain', async () => {
    await pasteWithImage({ 'text/html': '<p>un <b>mot</b></p>', 'text/plain': 'un mot brut' }, 'un mot brut')
  })

  it('pipe_dans_une_cellule_est_echappe', async () => {
    await pasteWithImage(
      { 'text/html': '<table><tr><td>k</td><td>v</td></tr><tr><td>a|b</td><td>1</td></tr></table>' },
      '| k | v |\n| --- | --- |\n| a\\|b | 1 |',
    )
  })

  it('saut_de_ligne_dans_une_cellule_devient_br', async () => {
    await pasteWithImage(
      { 'text/html': '<table><tr><td>k</td><td>v</td></tr><tr><td>l1<br>l2</td><td>1</td></tr></table>' },
      '| k | v |\n| --- | --- |\n| l1<br>l2 | 1 |',
    )
  })

  it('couleur_et_formule_ne_sont_pas_conservees', async () => {
    await pasteWithImage(
      { 'text/html': '<table><tr><td style="background:red" data-formula="=A1+1">x</td><td><b>y</b></td></tr><tr><td>1</td><td>2</td></tr></table>' },
      '| x | y |\n| --- | --- |\n| 1 | 2 |',
    )
  })

  it('insere_au_curseur_en_remplacant_la_selection', async () => {
    const { area } = setup()
    fireEvent.change(area, { target: { value: 'avant XX apres' } })
    area.setSelectionRange(6, 8)
    paste(area, clip([png()], { 'text/plain': 'mot' }))
    await waitFor(() => expect(area.value).toBe('avant mot apres'))
  })
})

describe('B-paste-1 exclusions', () => {
  it('un_collage_sans_image_est_laisse_au_navigateur', () => {
    const { area, fetchImpl } = setup()
    const event = paste(area, clip([], { 'text/html': '<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>', 'text/plain': 'a\tb\n1\t2' }))
    expect(event.defaultPrevented).toBe(false)
    expect(area.value).toBe('')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
