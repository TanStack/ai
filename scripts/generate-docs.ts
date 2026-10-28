import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateReferenceDocs } from '@tanstack/typedoc-config'
import { publishStagedDocs } from './publish-staged-docs.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const outputDir = resolve(__dirname, '../docs/reference').replaceAll('\\', '/')
// temp/ is gitignored. TypeDoc wipes this folder before convert, so a
// failed convert must not touch the committed docs/reference tree.
const stagingDir = resolve(__dirname, '../temp/docs-reference').replaceAll(
  '\\',
  '/',
)

/** @type {import('@tanstack/typedoc-config').Package[]} */
const packages = [
  {
    name: 'ai',
    entryPoints: [
      resolve(__dirname, '../packages/ai/src/index.ts').replaceAll('\\', '/'),
    ],
    tsconfig: resolve(
      __dirname,
      '../packages/ai/tsconfig.docs.json',
    ).replaceAll('\\', '/'),
    outputDir: stagingDir,
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
await publishStagedDocs(stagingDir, outputDir)

console.log('\nAll markdown files have been processed!')
