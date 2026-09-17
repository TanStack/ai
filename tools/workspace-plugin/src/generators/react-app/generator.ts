import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatFiles, generateFiles, names } from '@nx/devkit'
import type { Tree } from '@nx/devkit'
import type { ReactAppGeneratorSchema } from './schema'

/**
 * Write a thin TanStack Start React chat lab under `examples/<name>/`.
 *
 * @param tree - Nx virtual file tree
 * @param schema - Generator options. `name` is the app name from argv.
 */
export default async function reactAppGenerator(
  tree: Tree,
  schema: ReactAppGeneratorSchema,
) {
  const nameVariants = names(schema.name)
  generateFiles(
    tree,
    join(dirname(fileURLToPath(import.meta.url)), 'files'),
    `examples/${nameVariants.fileName}`,
    { ...nameVariants, tmpl: '' },
  )
  await formatFiles(tree)
}
