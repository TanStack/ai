import type { PRTriage } from './types'

/**
 * HTML markers embedded in bot comments so sweeps stay idempotent: before
 * posting, the sweep checks the item's timeline for the marker.
 */
export const ACK_MARKER = '<!-- tanstack-ai-maintainer-bot:ack -->'
export const REPRO_MARKER = '<!-- tanstack-ai-maintainer-bot:repro -->'

function checklistLine(ok: boolean, okText: string, warnText: string): string {
  return ok ? `- ✅ ${okText}` : `- ⚠️ ${warnText}`
}

export function buildAckComment(triage: PRTriage, assignee: string): string {
  const pr = triage.item
  const author = pr.author ? `@${pr.author}` : 'there'
  const lines = [
    `Thanks for the PR, ${author}! 🙌 @${assignee} will take a look.`,
    '',
    '**Automated pre-review checks**',
    checklistLine(
      !triage.ciFailing,
      pr.ciState === 'success' ? 'CI passing' : 'CI pending',
      'CI failing — worth a look before review',
    ),
    checklistLine(
      !triage.hasConflicts,
      'No merge conflicts',
      'Merge conflicts with `main` — please rebase',
    ),
    checklistLine(
      !triage.missingChangeset,
      'Changeset present',
      'No changeset found — run `pnpm changeset` if this changes published packages',
    ),
    checklistLine(
      !triage.missingE2E,
      'E2E test changes included',
      'No E2E test changes detected — behavior changes need coverage under `testing/e2e/` (see CONTRIBUTING)',
    ),
    '',
    '<sub>Automated triage — a human review follows.</sub>',
    ACK_MARKER,
  ]
  return lines.join('\n')
}

export function buildReproComment(author: string | null): string {
  const mention = author ? `@${author}` : 'there'
  return [
    `Thanks for the report, ${mention}! To help us reproduce this, could you add a minimal reproduction?`,
    '',
    'A runnable example makes fixes dramatically faster — you can fork one of the [official examples](https://github.com/TanStack/ai/tree/main/examples/), or use [StackBlitz](https://stackblitz.com/) / [CodeSandbox](https://codesandbox.io/). For TypeScript-only issues, a [TS Playground](https://www.typescriptlang.org/play) link works too.',
    '',
    '<sub>Automated triage — a maintainer will follow up.</sub>',
    REPRO_MARKER,
  ].join('\n')
}
