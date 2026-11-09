// Type-check this Angular example, including template type-checking.
//
// Angular template type-checking (`strictTemplates`) requires the Angular
// compiler (`ngc`), not plain `tsc`. `ngc` ships in `@angular/compiler-cli`,
// a direct devDependency. `@angular/build` only peers it.
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

// `@angular/compiler-cli` is resolvable from `@angular/build`'s location.
const buildPkg = require.resolve('@angular/build/package.json')
const cliPkgPath = require.resolve('@angular/compiler-cli/package.json', {
  paths: [buildPkg],
})
const cliPkg = require(cliPkgPath)
const ngc = join(dirname(cliPkgPath), cliPkg.bin.ngc)

const { status } = spawnSync(
  process.execPath,
  [ngc, '-p', 'tsconfig.app.json', '--noEmit'],
  { stdio: 'inherit' },
)

process.exit(status ?? 1)
