import { dirname, join } from 'node:path'
import { createNodesFromFiles, readJsonFile } from '@nx/devkit'
import type { CreateNodesV2 } from '@nx/devkit'

export const name = '@tanstack/workspace-plugin'

// CI coverage is also the unit-test execution. Local test:lib stays unchanged.
export const createNodesV2: CreateNodesV2 = [
  '**/package.json',
  async (files, options, context) =>
    createNodesFromFiles(
      (file) => {
        if (file === 'package.json') return {}
        const { scripts } = readJsonFile<{
          scripts?: Record<string, string>
        }>(join(context.workspaceRoot, file))
        if (!scripts?.['test:lib']) return {}
        return {
          projects: {
            [dirname(file)]: {
              targets: {
                'test:lib:ci': {
                  executor: 'nx:noop',
                  cache: true,
                  inputs: ['default', '^production'],
                  outputs: [],
                  dependsOn: [
                    scripts['test:coverage'] ? 'test:coverage' : 'test:lib',
                  ],
                },
              },
            },
          },
        }
      },
      files,
      options,
      context,
    ),
]
