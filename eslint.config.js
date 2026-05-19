// @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import unusedImports from 'eslint-plugin-unused-imports'

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...tanstackConfig,
  {
    name: 'tanstack/temp',
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      'no-case-declarations': 'off',
      'no-shadow': 'off',
      'unused-imports/no-unused-imports': 'warn',
      'pnpm/enforce-catalog': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // Typed-linting rules scoped to library source — issue #564.
    //
    // Restricted to `packages/typescript/*/src/**` so streaming + agent-loop
    // bugs that violate `no-floating-promises`, exhaustive-switch checks, or
    // async-misuse guarantees fail in CI without dragging tests, examples,
    // or build artefacts under the typed-linting cost.
    name: 'tanstack/ai/typed',
    files: ['packages/typescript/*/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-readonly': 'warn',
      // Override the base config which currently allows `@ts-ignore` with a
      // description and forbids `@ts-expect-error`. Invert that: require
      // descriptions on `@ts-expect-error` (which self-heals when the
      // underlying error disappears) and disallow `@ts-ignore` outright.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': false,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
    },
  },
  {
    // `no-restricted-syntax` banning `as unknown as <Type>` double-casts.
    //
    // Why separate from the typed-linting block: a few packages still ship a
    // local `eslint.config.js` that re-exports root. Flat-config evaluates
    // `files` globs relative to the *config-file's* directory, so the typed
    // block's `packages/typescript/*/src/**` glob fails to match anything
    // when re-exported from inside `packages/typescript/<pkg>/`. The dual
    // glob below works in both contexts.
    //
    // Why ban `as unknown as T`: it bypasses TS's structural-overlap check
    // (the safety net that errors when two types don't sufficiently
    // overlap), like `@ts-ignore` for type assertions. Plain `as T` keeps
    // the check. Genuine boundaries (vendor SDK shape drift, DOM lib
    // limitations, conditional-return narrowing failures) can opt out via
    // `// eslint-disable-next-line no-restricted-syntax -- <reason>`.
    name: 'tanstack/ai/no-double-as',
    files: [
      'packages/typescript/*/src/**/*.{ts,tsx}',
      'src/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "TSAsExpression > TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
          message:
            'Avoid `as unknown as <Type>` — it bypasses TS\'s structural overlap check. Prefer plain `as <Type>`, fix the root cause, or opt out with `// eslint-disable-next-line no-restricted-syntax -- <reason>`.',
        },
      ],
    },
  },
]

export default config
