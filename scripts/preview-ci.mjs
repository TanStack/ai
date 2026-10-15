import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function packPreview(root = process.cwd()) {
  const outputs = []
  for (const entry of readdirSync(join(root, 'packages'), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue
    const project = join('packages', entry.name)
    const manifest = join(root, project, 'package.json')
    if (!existsSync(manifest)) continue
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    if (pkg.private) continue
    // Source-only packages are published from the reporting job's checkout.
    const directories = ['dist', 'build'].filter(
      (dir) =>
        !pkg.files ||
        pkg.files.some((file) => file === dir || file.startsWith(`${dir}/`)),
    )
    if (directories.length === 0) continue
    const built = directories
      .map((dir) => join(project, dir))
      .filter((dir) => existsSync(join(root, dir)))
    if (built.length === 0) throw new Error(`No build outputs for ${project}`)
    outputs.push(...built)
  }
  if (outputs.length === 0) throw new Error('No package builds to publish.')
  const output = join(root, '.nx/pr-artifacts/preview-builds.tar.gz')
  mkdirSync(join(root, '.nx/pr-artifacts'), { recursive: true })
  execFileSync('tar', ['-czf', output, '--', ...outputs], {
    cwd: root,
    stdio: 'inherit',
  })
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  packPreview()
}
