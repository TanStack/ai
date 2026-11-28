import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

test('railway takes the environment from a project token', () => {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.RAILWAY_API_TOKEN
  delete env.RAILWAY_ENVIRONMENT_ID
  env.RAILWAY_TOKEN = 'test-project-token'

  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { railwaySandbox } from './packages/ai-sandbox-railway/dist/esm/index.js'

        // Stand-in for the Railway GraphQL API: records each operation and
        // answers the project-token lookup with the token's environment.
        const calls = []
        const checkpoints = [{ id: 'tsai-sbx-1-a', key: 'tsai-sbx-1-a', environmentId: 'env-from-token', createdAt: '' }]
        const fetch = async (_url, init) => {
          const { query, variables } = JSON.parse(init.body)
          const operation = /(?:query|mutation) (\\w+)/.exec(query)[1]
          calls.push({ operation, variables, headers: init.headers })
          const data =
            operation === 'RailwayProjectToken'
              ? { projectToken: { projectId: 'project-from-token', environmentId: 'env-from-token' } }
              : operation === 'RailwaySandboxCheckpoints'
                ? { sandboxCheckpoints: checkpoints }
                : operation === 'RailwaySandboxCheckpointDelete'
                  ? { sandboxCheckpointDelete: Boolean(checkpoints.splice(0, 1).length) }
                  : undefined
          assert.ok(data, \`unexpected operation \${operation}\`)
          return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } })
        }

        // A project token alone: the environment comes from the token.
        await railwaySandbox({ fetch }).deleteSnapshot({ snapshotId: 'tsai-sbx-1-a' })
        assert.equal(calls[0].operation, 'RailwayProjectToken')
        assert.equal(calls[0].headers['project-access-token'], 'test-project-token')
        for (const call of calls.slice(1)) assert.equal(call.variables.environmentId, 'env-from-token')
        assert.deepEqual(checkpoints, [])

        // An account token still needs RAILWAY_ENVIRONMENT_ID.
        delete process.env.RAILWAY_TOKEN
        process.env.RAILWAY_API_TOKEN = 'test-account-token'
        await assert.rejects(
          railwaySandbox({ fetch }).deleteSnapshot({ snapshotId: 'tsai-sbx-2-a' }),
          /RAILWAY_ENVIRONMENT_ID/,
        )
        console.log('environment resolved from the project token')
      `,
    ],
    {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8',
      env,
      timeout: 20_000,
    },
  )

  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('environment resolved from the project token')
})
