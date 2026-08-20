/**
 * Test setup for the component suites.
 *
 * React Testing Library only auto-cleans when the runner exposes globals, and
 * without cleanup every render accumulates in the same document — so the
 * second test in a file finds two of everything and fails with a message
 * ("found multiple elements") that says nothing about the actual cause.
 */

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
