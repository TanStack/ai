// CI for pull requests. Ported from .github/workflows/pr.yml.
// Not ported yet: `coverage` (needs comment edits on the forge) and `preview`
// (pkg-pr-new needs the pkg.pr.new GitHub App). Both stay on GitHub for now.
import { defineWorkflow, pullRequest, setup } from '@tanstack-source/ci'

export default defineWorkflow('pr', {
  on: [pullRequest()],
}).job('test', {
  checkout: { depth: 0 },
  // ponytail: Nx Cloud off, so Nx uses the forge's own task cache.
  env: { NX_NO_CLOUD: 'true' },
  egress: ['registry.npmjs.org', 'nodejs.org'],
  steps: [
    setup.node(),
    setup.pnpm(),
    { name: 'Install', run: 'pnpm install --frozen-lockfile' },
    { name: 'Run Checks', run: 'pnpm run test:pr' },
  ],
})
