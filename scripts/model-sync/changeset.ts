import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Create or update the `sync-models` changeset: a patch for each changed
 * package. An existing one keeps its packages, so each sync step can add its
 * own.
 */
export async function writeSyncChangeset(
  root: string,
  changedPackages: ReadonlySet<string>,
): Promise<void> {
  const dir = resolve(root, '.changeset')
  const existing = (await readdir(dir)).find(
    (file) => file.startsWith('sync-models') && file.endsWith('.md'),
  )
  const path = resolve(dir, existing ?? 'sync-models.md')
  const packages = new Set(changedPackages)
  if (existing)
    for (const match of (await readFile(path, 'utf-8')).matchAll(
      /'([^']+)':\s*patch/g,
    ))
      packages.add(match[1]!)
  const lines = [...packages].sort().map((pkg) => `'${pkg}': patch`)
  await writeFile(
    path,
    `---\n${lines.join('\n')}\n---\n\nUpdate model metadata\n`,
    'utf-8',
  )
  console.log(`\nChangeset ${existing ? 'updated' : 'created'}: ${path}`)
  console.log(`  Packages: ${[...packages].sort().join(', ')}`)
}
