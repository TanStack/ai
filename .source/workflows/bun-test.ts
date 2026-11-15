// .github/workflows/bun-test.yml on TanStack Source: the Bun-only tests of
// @tanstack/ai-isolate-quickjs-bun, which the Node test job skips.
import { defineWorkflow, pullRequest, setup } from '@tanstack-source/ci'

export default defineWorkflow('bun-test', {
  on: [
    pullRequest({
      paths: [
        'packages/ai-isolate-quickjs-bun/**',
        'packages/ai-code-mode/**',
        '.source/workflows/bun-test.ts',
      ],
    }),
  ],
}).job('test', {
  // The browser image has the Chromium of Playwright 1.57.0. `pnpm install` runs the
  // `playwright install chromium` postinstall of testing/e2e, which then downloads nothing.
  image: 'browser',
  // Nx Cloud is off, so Nx uses the task cache of the forge, and the job needs no secret.
  env: { NX_NO_CLOUD: 'true' },
  // npm for packages and pnpm, nodejs.org when .nvmrc names another Node than the image,
  // and the Playwright CDNs when the locked Playwright changes.
  egress: [
    'registry.npmjs.org',
    'nodejs.org',
    'cdn.playwright.dev',
    'playwright.download.prss.microsoft.com',
  ],
  steps: [
    // The steps of TanStack/config/.github/setup: pnpm, Node from .nvmrc, then the install.
    setup.node(),
    setup.pnpm(),
    { name: 'Install dependencies', run: 'pnpm install --frozen-lockfile' },
    // The repository has no .bun-version, so the job uses the bun of the image (1.4.4).
    // The driver needs bun 1.3.14 or later.
    setup.bun(),
    {
      name: 'Build package and its workspace dependencies',
      run: 'pnpm exec nx build @tanstack/ai-isolate-quickjs-bun',
    },
    {
      name: 'Run Bun test suite',
      run: 'pnpm --filter @tanstack/ai-isolate-quickjs-bun run test:bun',
    },
  ],
})
