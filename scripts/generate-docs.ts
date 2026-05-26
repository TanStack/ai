import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateReferenceDocs } from '@tanstack/typedoc-config'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** @type {import('@tanstack/typedoc-config').Package[]} */
const packages = [
  {
    name: 'ai',
    entryPoints: [
      resolve(__dirname, '../packages/ai/src/index.ts').replaceAll(
        '\\',
        '/',
      ),
    ],
    tsconfig: resolve(
      __dirname,
      '../packages/ai/tsconfig.docs.json',
    ).replaceAll('\\', '/'),
    outputDir: resolve(__dirname, '../docs/reference').replaceAll('\\', '/'),
    exclude: [
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/__tests__/**',
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
]

await generateReferenceDocs({ packages })

console.log('\n✅ All markdown files have been processed!')

process.exit(0)
