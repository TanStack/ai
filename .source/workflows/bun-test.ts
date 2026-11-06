// The Bun-only test suite of @tanstack/ai-isolate-quickjs-bun.
// Ported from .github/workflows/bun-test.yml.
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
  // ponytail: Nx Cloud off, so Nx uses the forge's own task cache.
  env: { NX_NO_CLOUD: 'true' },
  egress: [
    'registry.npmjs.org',
    'nodejs.org',
    // setup.bun() downloads from the GitHub release of Bun.
    'github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com',
  ],
  steps: [
    setup.node(),
    setup.pnpm(),
    // The driver needs Bun >= 1.3.14 (see the package `engines` field).
    setup.bun({ version: '1.4.4' }),
    { name: 'Install', run: 'pnpm install --frozen-lockfile' },
    {
      // `@tanstack/ai-code-mode` is imported at runtime by the driver, so nx
      // builds it to `dist/` first via `^build`.
      name: 'Build package and its workspace dependencies',
      run: 'pnpm exec nx build @tanstack/ai-isolate-quickjs-bun',
    },
    {
      name: 'Run Bun test suite',
      run: 'pnpm --filter @tanstack/ai-isolate-quickjs-bun run test:bun',
    },
  ],
})
