// What a paste inserts when the clipboard carries text beside an image
// (B-paste-1): a spreadsheet selection puts a picture, an HTML table and
// tab-separated text there at once, and the agent can only read the cells.
// Pure: the composer hands over the two strings, nothing here touches the DOM
// of the page (DOMParser builds a detached document).

export interface PasteClipboard {
  html?: string
  text?: string
}

const BREAK = '\u0000'

const cellOf = (raw: string): string =>
  raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(BREAK)
    .map((part) => part.trim())
    .join('<br>')
    .replace(/\|/g, '\\|')

/** A Markdown table, first row the header; null below two rows or two columns. */
function markdown(rows: string[][]): string | null {
  const width = Math.max(0, ...rows.map((row) => row.length))
  if (rows.length < 2 || width < 2) return null
  const line = (row: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => row[i] ?? '').join(' | ')} |`
  const [head, ...body] = rows as [string[], ...string[][]]
  return [line(head), `| ${Array(width).fill('---').join(' | ')} |`, ...body.map(line)].join('\n')
}

function parseHtml(html: string): Document | null {
  if (html.trim() === '' || typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(html, 'text/html')
}

function htmlTable(doc: Document): string | null {
  const table = doc.querySelector('table')
  if (!table) return null
  const rows = [...table.querySelectorAll('tr')]
    .filter((tr) => tr.closest('table') === table)
    .map((tr) =>
      [...tr.children]
        .filter((c) => c.tagName === 'TD' || c.tagName === 'TH')
        .map((c) => {
          const copy = c.cloneNode(true) as Element
          copy.querySelectorAll('br').forEach((br) => br.replaceWith(BREAK))
          return cellOf(copy.textContent ?? '')
        }),
    )
    .filter((row) => row.length > 0)
  return markdown(rows)
}

function tabbedTable(text: string): string | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return markdown(lines.map((line) => line.split('\t').map(cellOf)))
}

/**
 * The text to insert for this clipboard, or null when it carries none.
 * A table of at least two rows and two columns becomes a Markdown table; any
 * other content goes in as typed (HTML with no table gives its text, or the
 * plain text when there is one).
 */
export function pasteText(clipboard: PasteClipboard): string | null {
  const html = clipboard.html ?? ''
  const plain = clipboard.text ?? ''
  const doc = parseHtml(html)
  const fromHtml = doc ? htmlTable(doc) : null
  if (fromHtml) return fromHtml
  if (plain.trim() !== '') return tabbedTable(plain) ?? plain
  const body = doc?.body.textContent?.trim() ?? ''
  return body === '' ? null : body
}
