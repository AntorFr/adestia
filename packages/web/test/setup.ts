/**
 * Test setup for the component suites.
 *
 * React Testing Library only auto-cleans when the runner exposes globals, and
 * without cleanup every render accumulates in the same document — so the
 * second test in a file finds two of everything and fails with a message
 * ("found multiple elements") that says nothing about the actual cause.
 */

import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// Three seconds rather than the library's one: a `waitFor` is a signal, not
// a count, but its deadline is still a number — and a GitHub runner is always
// busy. One second took a page-not-found test red at 1149 ms on a machine
// that was doing something else; nothing here legitimately needs a second.
configure({ asyncUtilTimeout: 3000 })
