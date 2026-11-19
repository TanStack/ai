#!/usr/bin/env node
import { basename, extname, resolve } from 'node:path'
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
  const ext = extname(snippetPath)
  const name = basename(snippetPath, ext)
  const manifest = importSnippet(snippet, { name })
  // Append rather than replace when the snippet has no extension, so we never
  // write the manifest back over the snippet.
  const target =
    outPath ??
    (ext
      ? snippetPath.replace(/\.[^.]+$/, '.manifest.json')
      : `${snippetPath}.manifest.json`)
  if (resolve(target) === resolve(snippetPath)) {
    console.error(`Refusing to overwrite the snippet at ${snippetPath}.`)
    process.exit(1)
  }
  try {
    // 'wx' fails with EEXIST if the target exists — including when it is a
    // hard link or symlink aliasing the snippet, which a resolved-path compare
    // cannot detect. It also refuses to clobber a reviewed manifest in place.
    writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      console.error(
        `Refusing to overwrite the existing file at ${target}. Remove it first.`,
      )
      process.exit(1)
    }
    throw error
  }
  console.error(
    `Wrote ${target} (unreviewed). Fill scope/inject/limits and drop "unreviewed" before serving.`,
  )
}

main(process.argv.slice(2))
