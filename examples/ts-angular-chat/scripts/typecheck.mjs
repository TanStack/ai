// Type-check this Angular example, including template type-checking.
//
// Angular template type-checking (`strictTemplates`) requires the Angular
// compiler (`ngc`), not plain `tsc`. `ngc` ships in `@angular/compiler-cli`,
// which is a *peer* dependency of `@angular/build` (a direct devDependency of
// this example). We resolve it from there instead of declaring it directly so
// CI's frozen lockfile install stays unchanged.
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
