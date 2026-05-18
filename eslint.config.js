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
]

export default config
