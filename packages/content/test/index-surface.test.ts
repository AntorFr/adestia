import { describe, expect, it } from 'vitest'
import * as index from '../src/index.js'

describe('the content index (R-6)', () => {
  it.each(['formatReference', 'isValidId', 'isEditable'])('does_not_expose_%s', (name) => {
    expect(name in index).toBe(false)
  })
})
