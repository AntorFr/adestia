/**
 * What the linter is for here, and what it is deliberately NOT for.
 *
 * It is not a style engine. Formatting is not policed (no quotes, no semis, no
 * import order): those arguments cost review attention and the diff already
 * shows them. The recommended JavaScript and TypeScript rules check unused
 * bindings, explicit `any`, unreachable code and switch fallthroughs. React's
 * hook rules also run on the web shell (dependency checks are warnings).
 * Two rules use type information, `no-misused-promises` and `await-thenable`,
 * on `packages/**` (each workspace's tsconfig) and `plugins/**`
 * (`plugins/tsconfig.json`, which only lets the parser type the plain JS;
 * nothing is type-checked there). The third candidate, the rule on promises
 * nobody awaits, is off: its count is above the bar (see the rule's comment below). Ignored caught errors are allowed
 * (`caughtErrors: 'none'`), as are empty catch blocks. Deliberate exceptions
 * are explained beside their rules below.
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
      // Vendored barcode decoder: third-party bundle, maintained upstream.
      'plugins/scan/web/decoder.js',
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
    // Typed rules: a promise nobody awaits fails silently, which is the one
    // class of bug the untyped rules cannot see. Files outside a tsconfig
    // (config files at a package root) are not typed and keep the untyped set.
    files: ['packages/*/{src,test}/**/*.{ts,tsx}', 'plugins/**/*.{js,mjs}'],
    ignores: ['plugins/scan/web/decoder.js'],
    languageOptions: {
      parserOptions: {
        projectService: {
          // A probe piped through `--stdin` has no file on disk for the
          // project service to find: `qualite-serveur-besoin.test.ts` lints
          // one to check what this config claims.
          allowDefaultProject: ['packages/server/src/_probe.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `no-floating-promises` stays off: it reports 644 sites (22 in
      // production code, 622 in tests — most are node:test `test()` and
      // `describe()` calls), far above the 15-finding bar (AD-26). It is named
      // under Known defects with that count.
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },

  {
    files: ['packages/**/*.{ts,tsx,js,mjs}', '*.{js,mjs}', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
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
    files: ['plugins/**/*.{js,mjs}'],
    ignores: ['plugins/**/web/**/*.js'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['plugins/**/web/**/*.js'],
    languageOptions: { globals: globals.browser },
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
  // Legacy fixture imports in these existing tests are kept for the tester;
  // all other unused bindings remain checked, and no assertion is changed.
  ...[
    ['plugins/atelier/test/chants.test.js', '^(entre|traverse)$'],
    ['plugins/listening-post/test/library.test.js', '^(readFile|readdir|stat)$'],
    ['plugins/parcours/test/api.test.js', '^(join|ROOT)$'],
    ['plugins/voyages/test/api.test.js', '^(join|sep)$'],
  ].map(([file, varsIgnorePattern]) => ({
    files: [file],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern, caughtErrors: 'none',
      }],
    },
  })),

)
