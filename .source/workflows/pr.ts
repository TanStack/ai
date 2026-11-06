// The `Test` check of .github/workflows/pr.yml, on TanStack Source.
// The Coverage and Preview jobs of pr.yml stay on GitHub for now.
import { defineWorkflow, pullRequest, setup } from '@tanstack-source/ci'

export default defineWorkflow('pr', {
  on: [pullRequest()],
}).job('test', {
  // The browser image has the Chromium of Playwright 1.57.0. `pnpm install` runs the
  // `playwright install chromium` postinstall of testing/e2e, which then downloads nothing.
  image: 'browser',
  // `nx affected` compares with the base commit, so the job needs the history.
  // nrwl/nx-set-shas is built in: NX_BASE and NX_HEAD come from ctx.base and ctx.head.
  checkout: { depth: 0 },
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
    { name: 'Run Checks', run: 'pnpm run test:pr' },
  ],
})
