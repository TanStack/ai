// .github/workflows/e2e.yml on TanStack Source: the E2E shards and the `E2E Tests` gate.
import {
  artifact,
  defineWorkflow,
  pullRequest,
  push,
  setup,
} from '@tanstack-source/ci'

export default defineWorkflow('e2e', {
  on: [pullRequest(), push({ branches: ['main', 'alpha', 'beta', 'rc'] })],
})
  .job('e2e', {
    // The browser image has the browsers of Playwright 1.57.0, the version in pnpm-lock.yaml.
    // It replaces the Playwright browser cache of the GitHub workflow.
    image: 'browser',
    timeoutMinutes: 30,
    checkout: { depth: 0 },
    // Each shard runs to the end, as with `fail-fast: false` on GitHub.
    matrix: { shard: [1, 2, 3, 4] },
    // Nx Cloud is off, so Nx uses the task cache of the forge, and the job needs no secret.
    env: { NX_NO_CLOUD: 'true' },
    // npm for packages and pnpm, nodejs.org when .nvmrc names another Node than the image,
    // and the Playwright CDNs when the locked Playwright changes.
    // The tests talk to aimock on 127.0.0.1 only, so they need no provider host and no API key.
    egress: [
      'registry.npmjs.org',
      'nodejs.org',
      'cdn.playwright.dev',
      'playwright.download.prss.microsoft.com',
    ],
    steps: [
      {
        // First, so that the uploads are registered before a step can fail.
        name: 'Upload results after the job',
        do: (ctx) => {
          const upload = (name: string, paths: string[]) =>
            ctx.afterJob(
              (after) =>
                artifact({
                  name: `${name}-${ctx.matrix.shard}`,
                  paths,
                  retentionDays: 14,
                }).do(after),
              { always: true },
            )
          upload('e2e-videos', ['testing/e2e/test-results/**/*.webm'])
          upload('e2e-report', ['testing/e2e/playwright-report/'])
          upload('e2e-traces', ['testing/e2e/test-results/**/*.zip'])
        },
      },
      // The steps of TanStack/config/.github/setup: pnpm, Node from .nvmrc, then the install.
      setup.node(),
      setup.pnpm(),
      { name: 'Install dependencies', run: 'pnpm install --frozen-lockfile' },
      { name: 'Build Packages', run: 'pnpm run build:all' },
      // Downloads nothing while the image has the browser of the locked Playwright version.
      {
        name: 'Install Playwright Chromium',
        run: 'pnpm --filter @tanstack/ai-e2e exec playwright install chromium',
      },
      {
        name: 'Run E2E Tests',
        do: (ctx) =>
          ctx.sh`SHARD=${ctx.matrix.shard} bash -ec ${'pnpm --filter @tanstack/ai-e2e test:e2e --shard="$SHARD/4"'}`,
      },
    ],
  })
  // One result for all shards, as the `E2E Tests` job on GitHub.
  .job('e2e-result', {
    needs: ['e2e'],
    when: 'always',
    size: 'small',
    steps: [
      {
        name: 'Check shard results',
        do: (ctx) =>
          ctx.sh`RESULT=${ctx.needs.e2e.result} bash -ec ${'test "$RESULT" = success'}`,
      },
    ],
  })
