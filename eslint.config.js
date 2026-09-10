/**
 * What the linter is for here, and what it is deliberately NOT for.
 *
 * `npm run lint` existed as a script for months with no config behind it, so
 * it failed with "couldn't find an eslint.config.*" — a gate that is red for
 * everybody is a gate nobody reads. This makes it run, and pass.
 *
 * It is not a style engine. Formatting is not policed (no quotes, no semis, no
 * import order): those arguments cost review attention and the diff already
 * shows them. What is policed is the class of mistake that survives review and
 * TypeScript both — a floating promise, an `any` smuggled in, a caught error
 * thrown away, a `case` that falls through. Rules that would fire on the
 * repository's deliberate choices are off, with the reason written down rather
 * than left for the next person to rediscover.
 */

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // Build output, vendored bundles, and the spikes — a spike is scratch by
    // definition, and holding it to the product's bar would either weaken the
    // bar or slow down the enquiry it exists for.
    ignores: [
      '**/dist/**',
      '**/dist-web/**',
      '**/node_modules/**',
      // The shared React the import map publishes: third-party, minified, and
      // written into the tree by `npm run build` — so it is absent from a
      // fresh checkout and appears the first time anyone builds, which is a
      // fine way for a green lint to turn red for no reason.
      '**/public/vendor/**',
      'spikes/**',
      'bench/**',
      'plugins/**',
      'skins/**',
      'data/**',
      'tmp/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // The repository writes `#private` fields and reads them back; the base
      // rule cannot see that a constructor parameter feeds one.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          // `_sessionId` is the contract's parameter, unused by a driver that
          // keeps one session. Naming it out loud beats deleting it from a
          // signature the interface fixes.
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // An empty `catch` is how this codebase says "best effort, and a failure
      // here costs nothing" — `catch {}` with the reason in a comment above.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Off, because matching control characters is the POINT wherever this
      // fires: three regexes that scrub \x00-\x1f out of a filename, a config
      // value and a tool argument before any of them reaches a path or a
      // terminal. A rule that flags the sanitiser is a rule that would have us
      // delete the sanitising.
      'no-control-regex': 'off',
    },
  },

  {
    // The shell's own code has `eslint-disable-next-line
    // react-hooks/exhaustive-deps` comments in it, written against a plugin
    // that was never installed — so the disables pointed at nothing and the
    // rule they silence was never running either.
    files: ['packages/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    // Tests reach into internals and script fakes; `any` there is the fake's
    // job, not a leak into the product.
    files: ['**/test/**', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      // A fake driver's `runTurn` is an async generator that yields nothing
      // on purpose — the test is about what happens around it.
      'require-yield': 'off',
    },
  },
)
