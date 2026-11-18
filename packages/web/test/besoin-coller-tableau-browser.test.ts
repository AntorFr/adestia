/**
 * adestia-coller-tableau seen from its need — B-paste-1 (docs/parcours.md), P-2 step 7, screen E-16
 * (the composer of the chat rail): a paste whose clipboard carries text or HTML beside an image
 * (what a spreadsheet puts there) attaches nothing and inserts the text at the cursor; a table
 * (HTML <table>, or tab-separated text on two lines or more) goes in as a Markdown table whose
 * first row is the header; a table of one row or one column, and any other text, goes in as typed;
 * a cell keeps its value only; an image alone is attached as before; a paste with no image is
 * left to the browser.
 *
 * The clipboard is a synthetic ClipboardEvent dispatched in the composer of the bench instance
 * (scripted engine). The door of the effect is the screen itself: what the field holds, whether
 * the tray shows an attachment, whether POST /api/upload was called. Expectations are written by
 * hand from the need, never from the component. Playwright and Chromium come from the
 * environment; without them the file is skipped. Needs `npm run build` first.
 * `COLLER_SHOTS=<dir>` writes one capture per scenario.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type Instance, launch, newBrowser, playwright } from './charte-browser.js'

const SHOTS = process.env.COLLER_SHOTS

// a 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

interface Clip {
  text?: string
  html?: string
  image?: boolean
}

describe.skipIf(!playwright)('B-paste-1 · pasting spreadsheet cells in the chat composer (E-16, P-2 step 7)', () => {
  let browser: Awaited<ReturnType<typeof newBrowser>>
  let instance: Instance
  beforeAll(async () => {
    browser = await newBrowser()
    instance = await launch('chat-rail', 'skippy', 'en')
  }, 90_000)
  afterAll(async () => {
    await browser?.close()
    await instance?.stop()
  })

  async function session() {
    const context: any = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', ignoreHTTPSErrors: true })
    const page: any = await context.newPage()
    const uploads: string[] = []
    page.on('request', (r: any) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/upload') uploads.push(r.url())
    })
    await page.goto(`${instance.url}/#/`, { waitUntil: 'domcontentloaded' })
    await page.locator('.adestia-chat textarea').waitFor({ timeout: 20_000 })
    return { context, page, uploads }
  }

  /** Types `before` + `after` into the field, puts the cursor between, then pastes `clip`. Returns defaultPrevented. */
  async function paste(page: any, clip: Clip, around: [string, string] = ['', '']): Promise<boolean> {
    const field = page.locator('.adestia-chat textarea')
    if (around[0] + around[1]) await field.fill(around[0] + around[1])
    return page.evaluate(
      ({ clip, caret, png }: { clip: Clip; caret: number; png: string }) => {
        const ta = document.querySelector('.adestia-chat textarea') as HTMLTextAreaElement
        ta.focus()
        ta.setSelectionRange(caret, caret)
        const dt = new DataTransfer()
        if (clip.text !== undefined) dt.setData('text/plain', clip.text)
        if (clip.html !== undefined) dt.setData('text/html', clip.html)
        if (clip.image) {
          const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
          dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }))
        }
        const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
        ta.dispatchEvent(ev)
        return ev.defaultPrevented
      },
      { clip, caret: around[0].length, png: PNG },
    )
  }

  const value = (page: any): Promise<string> => page.locator('.adestia-chat textarea').inputValue()
  const trayCount = (page: any): Promise<number> => page.getByRole('button', { name: /^Remove / }).count()
  /** A Markdown table as rows of trimmed cells, the separator row as 'sep'. */
  function rows(md: string): (string[] | 'sep')[] {
    return md
      .trim()
      .split('\n')
      .map((line) => {
        const body = line.trim().replace(/^\|/, '').replace(/\|$/, '')
        const cells = body.split(/(?<!\\)\|/).map((c) => c.trim())
        return cells.every((c) => /^:?-{3,}:?$/.test(c)) ? 'sep' : cells
      })
  }
  async function shot(page: any, name: string) {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/coller-${name}.png` })
  }
  /** What the composer does once the paste is handled: the field changed. */
  async function settled(page: any, from: string) {
    await page.waitForFunction((v: string) => (document.querySelector('.adestia-chat textarea') as HTMLTextAreaElement).value !== v, from, { timeout: 5_000 })
  }

  const EXCEL_TEXT = 'Nom\tQté\r\nPomme\t3\r\nPoire\t5\r\n'
  const EXCEL_HTML =
    '<html><body><!--StartFragment--><table><tr><td style="background:#ff0">Nom</td><td>Qté</td></tr>' +
    '<tr><td>Pomme</td><td>3</td></tr><tr><td>Poire</td><td>5</td></tr></table><!--EndFragment--></body></html>'
  const FRUITS: (string[] | 'sep')[] = [['Nom', 'Qté'], 'sep', ['Pomme', '3'], ['Poire', '5']]

  // Panne visée : onPaste attaches the file and drops the text (the origin of the need).
  it('inserts a Markdown table and attaches nothing when Excel puts text, HTML table and an image on the clipboard', async () => {
    const { context, page, uploads } = await session()
    try {
      const prevented = await paste(page, { text: EXCEL_TEXT, html: EXCEL_HTML, image: true })
      await settled(page, '')
      expect(prevented).toBe(true)
      expect(rows(await value(page))).toEqual(FRUITS)
      expect(await trayCount(page)).toBe(0)
      await page.waitForTimeout(1500) // an upload, if one was started, has left by now
      expect(uploads).toEqual([])
      expect(await trayCount(page)).toBe(0)
      await shot(page, 'excel')
    } finally {
      await context.close()
    }
  }, 60_000)

  // Panne visée : the table is built from the HTML only, or from the text only.
  it('builds the table from the tab-separated text alone, beside an image', async () => {
    const { context, page, uploads } = await session()
    try {
      await paste(page, { text: EXCEL_TEXT, image: true })
      await settled(page, '')
      expect(rows(await value(page))).toEqual(FRUITS)
      expect(await trayCount(page)).toBe(0)
      expect(uploads).toEqual([])
    } finally {
      await context.close()
    }
  }, 60_000)

  it('builds the table from an HTML table alone, beside an image', async () => {
    const { context, page, uploads } = await session()
    try {
      await paste(page, { html: EXCEL_HTML, image: true })
      await settled(page, '')
      expect(rows(await value(page))).toEqual(FRUITS)
      expect(await trayCount(page)).toBe(0)
      expect(uploads).toEqual([])
    } finally {
      await context.close()
    }
  }, 60_000)

  // Panne visée : the text replaces the field, or goes to its end, instead of the cursor.
  it('inserts the table at the cursor, keeping the text around it', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { text: EXCEL_TEXT, html: EXCEL_HTML, image: true }, ['AVANT ', ' APRES'])
      await settled(page, 'AVANT  APRES')
      const v = await value(page)
      expect(v.startsWith('AVANT ')).toBe(true)
      expect(v.endsWith(' APRES')).toBe(true)
      expect(rows(v.slice('AVANT '.length, v.length - ' APRES'.length))).toEqual(FRUITS)
    } finally {
      await context.close()
    }
  }, 60_000)

  // Bord : a table of exactly two rows and two columns, the smallest that is a table.
  it('turns a 2 x 2 table into a Markdown table, first row as the header', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { text: 'a\tb\nc\td', image: true })
      await settled(page, '')
      expect(rows(await value(page))).toEqual([['a', 'b'], 'sep', ['c', 'd']])
    } finally {
      await context.close()
    }
  }, 60_000)

  // Bord : Excel ends its text with a line break, which is not a row.
  it('does not add an empty row for the line break Excel ends the text with', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { text: 'a\tb\r\nc\td\r\n', image: true })
      await settled(page, '')
      expect(rows(await value(page))).toEqual([['a', 'b'], 'sep', ['c', 'd']])
    } finally {
      await context.close()
    }
  }, 60_000)

  // Bord : an empty cell keeps its place.
  it('keeps an empty cell in its column', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { text: 'a\t\tc\n1\t2\t3', image: true })
      await settled(page, '')
      expect(rows(await value(page))).toEqual([['a', '', 'c'], 'sep', ['1', '2', '3']])
    } finally {
      await context.close()
    }
  }, 60_000)

  // Bord : one row is not a table, it goes in as typed.
  it('inserts a one-row selection as typed, without a Markdown table', async () => {
    const { context, page, uploads } = await session()
    try {
      await paste(page, { text: 'a\tb\tc', image: true })
      await settled(page, '')
      expect(await value(page)).toBe('a\tb\tc')
      expect(await trayCount(page)).toBe(0)
      expect(uploads).toEqual([])
    } finally {
      await context.close()
    }
  }, 60_000)

  // Bord : one column is not a table either.
  it('inserts a one-column selection as typed, without a Markdown table', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { text: 'a\nb\nc', image: true })
      await settled(page, '')
      expect(await value(page)).toBe('a\nb\nc')
      expect(await trayCount(page)).toBe(0)
    } finally {
      await context.close()
    }
  }, 60_000)

  it('inserts a one-row HTML table as typed, from the plain text', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { text: 'a\tb\tc', html: '<table><tr><td>a</td><td>b</td><td>c</td></tr></table>', image: true })
      await settled(page, '')
      expect(await value(page)).toBe('a\tb\tc')
    } finally {
      await context.close()
    }
  }, 60_000)

  // Bord : any other text beside an image goes in as typed, nothing attached.
  it('inserts ordinary text as typed and attaches nothing when it comes with an image', async () => {
    const { context, page, uploads } = await session()
    try {
      await paste(page, { text: 'bonjour le monde', image: true })
      await settled(page, '')
      expect(await value(page)).toBe('bonjour le monde')
      expect(await trayCount(page)).toBe(0)
      expect(uploads).toEqual([])
    } finally {
      await context.close()
    }
  }, 60_000)

  it('inserts the plain text of an HTML paste with no table, beside an image', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { text: 'bonjour', html: '<p>bonjour</p>', image: true })
      await settled(page, '')
      expect(await value(page)).toBe('bonjour')
      expect(await trayCount(page)).toBe(0)
    } finally {
      await context.close()
    }
  }, 60_000)

  it('inserts the text of an HTML paste with no table and no plain text, beside an image', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { html: '<p>bonjour</p>', image: true })
      await settled(page, '')
      expect(await value(page)).toBe('bonjour')
      expect(await trayCount(page)).toBe(0)
    } finally {
      await context.close()
    }
  }, 60_000)

  // Exclusion : a cell keeps its value only. Panne visée : an unescaped | adds a column.
  it('escapes a | in a cell so that it stays one cell, in text and in HTML', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { text: 'x\ty\na|b\tc', image: true })
      await settled(page, '')
      expect(rows(await value(page))).toEqual([['x', 'y'], 'sep', ['a\\|b', 'c']])
    } finally {
      await context.close()
    }
    const second = await session()
    try {
      await paste(second.page, { html: '<table><tr><td>x</td><td>y</td></tr><tr><td>a|b</td><td>c</td></tr></table>', image: true })
      await settled(second.page, '')
      expect(rows(await value(second.page))).toEqual([['x', 'y'], 'sep', ['a\\|b', 'c']])
    } finally {
      await second.context.close()
    }
  }, 60_000)

  // Panne visée : a line break in a cell cuts the Markdown row in two.
  it('writes a line break inside an HTML cell as <br>, on one Markdown row', async () => {
    const { context, page } = await session()
    try {
      await paste(page, { html: '<table><tr><td>x</td><td>y</td></tr><tr><td>ligne1<br>ligne2</td><td>c</td></tr></table>', image: true })
      await settled(page, '')
      const v = (await value(page)).trim()
      expect(v.split('\n')).toHaveLength(3)
      expect(rows(v)).toEqual([['x', 'y'], 'sep', ['ligne1<br>ligne2', 'c']])
    } finally {
      await context.close()
    }
  }, 60_000)

  // Exclusion : no colour, no formula — the cell's value only.
  it('drops colours and formulas: the cell keeps its value only', async () => {
    const { context, page } = await session()
    try {
      const html =
        '<table><tr><td style="background:red;color:#fff" bgcolor="#ff0000">Total</td><td><b>Valeur</b></td></tr>' +
        '<tr><td>Somme</td><td x:fmla="=SUM(B2:B9)" style="color:blue">42</td></tr></table>'
      await paste(page, { html, image: true })
      await settled(page, '')
      const v = await value(page)
      expect(rows(v)).toEqual([['Total', 'Valeur'], 'sep', ['Somme', '42']])
      for (const leftover of ['SUM', 'background', 'color', '<td', '<b>', '#ff']) expect(v).not.toContain(leftover)
    } finally {
      await context.close()
    }
  }, 60_000)

  // Exclusion : text and HTML with no image is not the case the need changes.
  it('leaves a paste with no image to the browser, without taking it over', async () => {
    const { context, page, uploads } = await session()
    try {
      const prevented = await paste(page, { text: EXCEL_TEXT, html: EXCEL_HTML })
      expect(prevented).toBe(false)
      await page.waitForTimeout(500)
      expect(await trayCount(page)).toBe(0)
      expect(uploads).toEqual([])
    } finally {
      await context.close()
    }
  }, 60_000)

  // Nominal of the unchanged case. Panne visée : the image is dropped as well, or never uploaded.
  it('still attaches an image pasted alone, as before', async () => {
    const { context, page, uploads } = await session()
    try {
      const answered = page.waitForResponse((r: any) => new URL(r.url()).pathname === '/api/upload' && r.request().method() === 'POST', { timeout: 15_000 })
      await paste(page, { image: true })
      expect((await answered).ok()).toBe(true)
      await page.getByRole('button', { name: /^Remove / }).first().waitFor({ timeout: 10_000 })
      expect(await trayCount(page)).toBe(1)
      expect(uploads).toHaveLength(1)
      expect(await value(page)).toBe('')
      await shot(page, 'image-seule')
    } finally {
      await context.close()
    }
  }, 60_000)
})
