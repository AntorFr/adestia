/**
 * The screen replay, against what the CLI actually sends.
 *
 * Every case here is a shape captured from Claude Code 2.1.237 driving
 * `setup-token` under a pty — not a shape imagined for the emulator.
 */

import { describe, expect, it } from 'vitest'

import { renderScreen } from '../src/claude-code/screen.js'
import { stripAnsi } from '../src/claude-code/arming.js'

const ESC = String.fromCharCode(27)

describe('replaying a terminal', () => {
  it('leaves plain output exactly as it was', () => {
    // The property that makes this safe under every matcher: a CLI that
    // simply prints lines is a terminal on which nothing ever moved.
    expect(renderScreen('Paste code here:')).toBe('Paste code here:')
    expect(renderScreen('one\ntwo\nthree')).toBe('one\ntwo\nthree')
  })

  it('restores the spaces Ink never sends', () => {
    // Ink places each word by column instead of printing the gaps.
    const inked = `${ESC}[2GPaste${ESC}[8Gcode${ESC}[13Ghere${ESC}[18Gif${ESC}[21Gprompted${ESC}[30G>`
    expect(renderScreen(inked)).toBe(' Paste code here if prompted >')
    // What the old reading gave instead — one word, matching nothing.
    expect(stripAnsi(inked)).toBe('Pastecodehereifprompted>')
  })

  it('restores a character that was never re-sent at all', () => {
    // Verbatim from a real run: between two frames the `o` of `code` did not
    // change, so it was skipped. Read off the stream the word is `cde`.
    const captured =
      `OAuth error: Invalid${ESC}[23Gcode. Please make${ESC}[41Gsure the full` +
      ` ${ESC}[55Gc${ESC}[57Gde was${ESC}[64Gcopied`
    // The frame before: spaces, and the `o` sitting where the next frame
    // will not bother to send one.
    const drawn = `${' '.repeat(55)}o` + `\r${captured}`

    expect(renderScreen(drawn)).toContain('code. Please make sure the full code was copied')
    expect(stripAnsi(drawn)).toContain('cde was')
    expect(renderScreen(drawn)).not.toContain('cde was')
  })

  it('follows the cursor up, down, forward and back', () => {
    expect(renderScreen(`abc\ndef${ESC}[1A${ESC}[1GXY`)).toBe('XYc\ndef')
    expect(renderScreen(`abcdef${ESC}[3D${ESC}[1CZ`)).toBe('abcdZf')
  })

  it('erases what the CLI erases', () => {
    // Line erase to the end, which is how Ink shortens a line it redraws.
    expect(renderScreen(`hello world\r${ESC}[6G${ESC}[K`)).toBe('hello')
    // Whole-line erase, then a rewrite over the top.
    expect(renderScreen(`stale\r${ESC}[2Kfresh`)).toBe('fresh')
  })

  it('drops the hyperlink target, which is not text on screen', () => {
    // The URL is read from the raw stream instead — see findAuthorizeUrl.
    const link = `${ESC}]8;id=1;https://claude.com/oauthclick here${ESC}]8;;`
    expect(renderScreen(link)).toBe('click here')
  })

  it('scrolls rather than growing without bound', () => {
    // A flow left running must not turn its screen into a transcript.
    const many = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n')
    const drawn = renderScreen(many)
    expect(drawn.split('\n').length).toBeLessThanOrEqual(40)
    expect(drawn).toContain('line 99')
  })
})
