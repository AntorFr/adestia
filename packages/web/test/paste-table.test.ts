// @vitest-environment jsdom
/** B-paste-1: what a paste inserts when the clipboard carries text beside an image. */
import { describe, expect, it } from 'vitest'

import { pasteText } from '../src/chat/paste-table.js'

const T = (rows: string) => `<table>${rows}</table>`

describe('pasteText (B-paste-1)', () => {
  it('turns an HTML 2x2 table into a Markdown table, first row the header', () => {
    const html = T('<tr><td>Nom</td><td>Age</td></tr><tr><td>Ann</td><td>30</td></tr>')
    expect(pasteText({ html, text: 'Nom\tAge\nAnn\t30' })).toBe('| Nom | Age |\n| --- | --- |\n| Ann | 30 |')
  })

  it('turns tab-separated text alone (beside an image) into a table, CRLF and trailing newline included', () => {
    expect(pasteText({ text: 'a\tb\r\n1\t2\r\n' })).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })

  it('escapes a pipe in a cell, in HTML and in tabbed text', () => {
    const html = T('<tr><th>x|y</th><th>z</th></tr><tr><td>1</td><td>2</td></tr>')
    expect(pasteText({ html })).toBe('| x\\|y | z |\n| --- | --- |\n| 1 | 2 |')
    expect(pasteText({ text: 'x|y\tz\n1\t2' })).toBe('| x\\|y | z |\n| --- | --- |\n| 1 | 2 |')
  })

  it('writes a line break inside a cell as <br>, not as a row break', () => {
    const html = T('<tr><td>a<br>b</td><td>c</td></tr><tr><td>1</td><td>2</td></tr>')
    expect(pasteText({ html })).toBe('| a<br>b | c |\n| --- | --- |\n| 1 | 2 |')
  })

  it('keeps the value only: no colour, no markup of the cell', () => {
    const html = T('<tr><td style="color:red"><b>A</b></td><td>B</td></tr><tr><td>1</td><td>2</td></tr>')
    expect(pasteText({ html })).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('inserts non-tabular text as it is', () => {
    expect(pasteText({ text: 'bonjour\nle monde' })).toBe('bonjour\nle monde')
    expect(pasteText({ text: '  texte simple ' })).toBe('  texte simple ')
  })

  it('inserts a one-row table or a one-column table as text', () => {
    expect(pasteText({ text: 'a\tb' })).toBe('a\tb')
    expect(pasteText({ text: 'a\nb\nc' })).toBe('a\nb\nc')
    const oneRow = T('<tr><td>a</td><td>b</td></tr>')
    expect(pasteText({ html: oneRow, text: 'a\tb' })).toBe('a\tb')
    const oneCol = T('<tr><td>a</td></tr><tr><td>b</td></tr>')
    expect(pasteText({ html: oneCol, text: 'a\nb' })).toBe('a\nb')
  })

  it('gives the text of HTML with no table, or the plain text when there is one', () => {
    expect(pasteText({ html: '<p>un <b>mot</b></p>' })).toBe('un mot')
    expect(pasteText({ html: '<p>html</p>', text: 'brut' })).toBe('brut')
  })

  it('returns null when the clipboard carries no text at all', () => {
    expect(pasteText({})).toBeNull()
    expect(pasteText({ html: '', text: '' })).toBeNull()
    expect(pasteText({ html: '<div> </div>', text: '  ' })).toBeNull()
  })

  it('ignores a table nested in a cell when reading the outer rows', () => {
    const html = T('<tr><td>a<table><tr><td>x</td><td>y</td></tr></table></td><td>b</td></tr><tr><td>1</td><td>2</td></tr>')
    const out = pasteText({ html }) as string
    expect(out.split('\n')).toHaveLength(3)
  })
})
