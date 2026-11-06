// E2E tests. Ported from .github/workflows/e2e.yml.
import {
  artifact,
  cache,
  defineWorkflow,
  pullRequest,
  push,
  setup,
} from '@tanstack-source/ci'

export default defineWorkflow('e2e', {
  on: [pullRequest(), push({ branches: ['main', 'alpha', 'beta', 'rc'] })],
})
  .job('e2e', {
    image: 'browser',
    size: 'medium',
    timeoutMinutes: 30,
    checkout: { depth: 0 },
    matrix: { shard: [1, 2, 3, 4] },
    // ponytail: Nx Cloud off, so Nx uses the forge's own task cache.
    env: { NX_NO_CLOUD: 'true' },
    egress: [
      'registry.npmjs.org',
      'nodejs.org',
      'cdn.playwright.dev',
      'playwright.download.prss.microsoft.com',
    ],
    steps: [
      setup.node(),
      setup.pnpm(),
      { name: 'Install', run: 'pnpm install --frozen-lockfile' },
      {
        name: 'Cache Playwright Browsers',
        do: async (ctx) => {
          const { stdout } = await ctx.sh`sha256sum testing/e2e/package.json`
          await cache({
            key: `playwright-${stdout.slice(0, 16)}`,
            paths: ['~/.cache/ms-playwright'],
            restoreKeys: ['playwright-'],
          }).do(ctx)
          // Upload the results also when the tests fail.
          const shard = ctx.matrix.shard
          ctx.afterJob(
            async (after) => {
              await artifact({
                name: `e2e-videos-${shard}`,
                paths: ['testing/e2e/test-results/**/*.webm'],
                retentionDays: 14,
              }).do(after)
              await artifact({
                name: `e2e-report-${shard}`,
                paths: ['testing/e2e/playwright-report/'],
                retentionDays: 14,
              }).do(after)
              await artifact({
                name: `e2e-traces-${shard}`,
                paths: ['testing/e2e/test-results/**/*.zip'],
                retentionDays: 14,
              }).do(after)
            },
            { name: 'Upload test results', always: true },
          )
        },
      },
      { name: 'Build Packages', run: 'pnpm run build:all' },
      // A no-op when the cache restored the browser.
      {
        name: 'Install Playwright Chromium',
        run: 'pnpm --filter @tanstack/ai-e2e exec playwright install chromium',
      },
      {
        name: 'Run E2E Tests',
        do: (ctx) =>
          ctx.sh`pnpm --filter @tanstack/ai-e2e test:e2e ${`--shard=${ctx.matrix.shard}/4`}`,
      },
    ],
  })
  // One check for all shards, to use in a branch rule.
  .job('e2e-result', {
    needs: ['e2e'],
    when: 'always',
    steps: [
      {
        name: 'Check shard results',
        do: (ctx) => {
          if (ctx.needs.e2e.result !== 'success') {
            throw new Error(`E2E shards: ${ctx.needs.e2e.result}`)
          }
        },
      },
    ],
  })
