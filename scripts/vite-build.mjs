// Runs one half of a package's `vite build` (issue #1611).
//
//   node ../../scripts/vite-build.mjs types   only the `.d.ts` files
//   node ../../scripts/vite-build.mjs js      only the JS bundle and source maps
//
// Run it from a package directory. Both halves load that package's
// `vite.config.ts`, so the declarations come from the same `vite-plugin-dts`
// setup that `vite build` uses. Nx runs `types` before `js` (see `nx.json`).
// Neither half empties `dist`, because the other half's files are in it.
// Run `pnpm clean` to remove stale files.
import { build, loadConfigFromFile } from 'vite'

const half = process.argv[2]
if (half !== 'types' && half !== 'js') {
  throw new Error('Usage: vite-build.mjs <types|js>')
}

if (half === 'types') {
  await build({
    build: { emptyOutDir: false, sourcemap: false },
    plugins: [
      {
        // vite-plugin-dts writes in `writeBundle`, so the bundle step must run.
        // Remove its chunks so that it writes no JS.
        name: 'types-only',
        generateBundle(_, bundle) {
          for (const file of Object.keys(bundle)) delete bundle[file]
        },
      },
    ],
  })
} else {
  const { config } = await loadConfigFromFile({
    command: 'build',
    mode: 'production',
  })
  const plugins = config.plugins.flat(Infinity)
  const withoutDts = plugins.filter((plugin) => plugin?.name !== 'unplugin-dts')
  if (withoutDts.length === plugins.length) {
    throw new Error('vite-build.mjs: found no vite-plugin-dts plugin to remove')
  }
  await build({
    ...config,
    configFile: false,
    plugins: withoutDts,
    build: { ...config.build, emptyOutDir: false },
  })
}
