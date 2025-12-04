import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { generateReferenceDocs } from '@tanstack/typedoc-config'
import { glob } from 'tinyglobby'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** @type {import('@tanstack/typedoc-config').Package[]} */
const packages = [
  {
    name: 'ai',
    entryPoints: [
      resolve(__dirname, '../packages/typescript/ai/src/index.ts').replaceAll(
        '\\',
        '/',
      ),
    ],
    tsconfig: resolve(
      __dirname,
      '../packages/typescript/ai/tsconfig.docs.json',
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

// Find all markdown files matching the pattern
const markdownFiles = [
  ...(await glob('docs/reference/**/*.md')),
  ...(await glob('docs/framework/*/reference/**/*.md')),
]

console.log(`Found ${markdownFiles.length} markdown files to process\n`)

// Process each markdown file
markdownFiles.forEach((file) => {
  const content = readFileSync(file, 'utf-8')
  let updatedContent = content
  updatedContent = updatedContent.replaceAll(/\]\(\.\.\//gm, '](../')
  // updatedContent = content.replaceAll(/\]\(\.\//gm, '](../')
  updatedContent = updatedContent.replaceAll(
    /\]\((?!https?:\/\/|\/\/|\/|\.\/|\.\.\/|#)([^)]+)\)/gm,
    (match, p1) => `](./${p1})`,
  )

  // Write the updated content back to the file
  if (updatedContent !== content) {
    writeFileSync(file, updatedContent, 'utf-8')
    console.log(`Processed file: ${file}`)
  }
})

console.log('\n✅ All markdown files have been processed!')

process.exit(0)
