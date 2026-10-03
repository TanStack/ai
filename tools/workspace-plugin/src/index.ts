import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { workspaceRoot } from '@nx/devkit'
import type { CreateNodesV2 } from '@nx/devkit'

export const name = '@tanstack/workspace-plugin'

// The `packages` list of `pnpm-workspace.yaml`, so that this plugin sees the
// same projects that pnpm and Nx see.
const workspaces = readFileSync(
  join(workspaceRoot, 'pnpm-workspace.yaml'),
  'utf8',
)
  .match(/^packages:\n((?: +- .+\n)+)/m)![1]!
  .trim()
  .split('\n')
  .map((line) => line.replace(/^ *- *['"]?|['"]$/g, ''))

/**
 * Sets the Nx `outputs` of each `build` target (issue #1611).
 *
 * A package whose `build` script runs `scripts/vite-build.mjs js` has a split
 * build. Its `build` target owns only the JS, and this plugin adds a
 * `build:types` target that owns the `.d.ts` files (see `nx.json`). The two
 * targets must not own the same files. If they do, a `build` cache restore
 * replaces the `.d.ts` files while a consumer typecheck reads them.
 *
 * All other `build` targets own `build/` and `dist/`. `nx.json` cannot hold
 * that default, because a `targetDefaults` value replaces the value from here.
 */
export const createNodesV2: CreateNodesV2 = [
  `{${workspaces.join(',')}}/package.json`,
  (files) =>
    files.flatMap((file) => {
      const build: unknown = JSON.parse(
        readFileSync(join(workspaceRoot, file), 'utf8'),
      ).scripts?.build
      if (typeof build !== 'string') return []
      const split = build.includes('scripts/vite-build.mjs js')
      return [
        [
          file,
          {
            projects: {
              [dirname(file)]: {
                targets: {
                  build: {
                    outputs: split
                      ? ['{projectRoot}/dist/**/*.{js,cjs,map}']
                      : ['{projectRoot}/build', '{projectRoot}/dist'],
                  },
                  ...(split && {
                    'build:types': {
                      command: 'node ../../scripts/vite-build.mjs types',
                      options: { cwd: '{projectRoot}' },
                    },
                  }),
                },
              },
            },
          },
        ] as const,
      ]
    }),
]
