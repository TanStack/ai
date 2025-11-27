// @ts-check

// @ts-ignore Needed due to moduleResolution Node vs Bundler
import { tanstackConfig } from '@tanstack/config/eslint'
import unusedImports from 'eslint-plugin-unused-imports'

/** @type {import('eslint').Linter.FlatConfig[]} */
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
]

export default config
