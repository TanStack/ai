#!/usr/bin/env node
import { basename, extname } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { importSnippet } from '../importer'

/**
 * tanstack-ai-sandbox-import <snippet.ts> [manifest.json]
 *
 * Emits a deny-by-default, unreviewed manifest next to the snippet. The tool is
 * NOT servable until a human fills the security fields (scope, inject, limits)
 * and removes `unreviewed`.
 */
function main(argv: Array<string>): void {
  const [snippetPath, outPath] = argv
  if (!snippetPath) {
    console.error(
      'usage: tanstack-ai-sandbox-import <snippet.ts> [manifest.json]',
    )
    process.exit(1)
  }
  const snippet = readFileSync(snippetPath, 'utf8')
  const name = basename(snippetPath, extname(snippetPath))
  const manifest = importSnippet(snippet, { name })
  const target = outPath ?? snippetPath.replace(/\.[^.]+$/, '.manifest.json')
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`)
  console.error(
    `Wrote ${target} (unreviewed). Fill scope/inject/limits and drop "unreviewed" before serving.`,
  )
}

main(process.argv.slice(2))
