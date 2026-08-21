import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addCode, composeMessage, createBasket, dropCode } from '../web/codes.js'

test('a code lands in the basket once', () => {
  const basket = createBasket()
  assert.equal(addCode(basket, '3017620422003'), true)
  // The camera sees the same label ten times a second; the caller beeps only
  // when the basket actually changed.
  assert.equal(addCode(basket, '3017620422003'), false)
  assert.deepEqual(basket.codes, ['3017620422003'])
})

test('blank readings are ignored', () => {
  const basket = createBasket()
  assert.equal(addCode(basket, '   '), false)
  assert.equal(addCode(basket, null), false)
  assert.deepEqual(basket.codes, [])
})

test('a dropped code does not come straight back', () => {
  // Without the memory of the refusal, the camera re-reads the label a tenth
  // of a second later: one wrong code would condemn the basket, and the only
  // way out would be closing the scanner.
  const basket = createBasket()
  addCode(basket, '123')
  dropCode(basket, '123')
  assert.equal(addCode(basket, '123'), false)
  assert.deepEqual(basket.codes, [])
})

test('dropping one code leaves the others alone', () => {
  const basket = createBasket()
  addCode(basket, 'a')
  addCode(basket, 'b')
  dropCode(basket, 'a')
  assert.deepEqual(basket.codes, ['b'])
})

test('the codes are appended to what was typed, never replacing it', () => {
  // The sentence in the field IS the instruction; the codes are its object.
  assert.equal(composeMessage('ajoute aux courses', ['123', '456']), 'ajoute aux courses 123 456')
})

test('an empty field just gets the codes', () => {
  assert.equal(composeMessage('', ['123']), '123')
  assert.equal(composeMessage('   ', ['123']), '123')
})

test('an empty basket changes nothing', () => {
  assert.equal(composeMessage('déjà tapé', []), 'déjà tapé')
})
