# Maintainer toolset

Automation that keeps on top of open PRs, issues, and discussions:

- **Sweep** (`.github/workflows/maintainer-sweep.yml`, every 3h): assigns each
  open PR/issue to a maintainer, posts a one-time ack comment with a
  deterministic pre-review checklist, asks for a reproduction on bug reports
  that lack one, and reconciles `waiting-on: *` / `ready-to-merge` /
  `needs-repro` / `has-pr` labels.
- **Scorecard** (`.github/workflows/maintainer-scorecard.yml`, daily): posts a
  to-do digest to Discord — SLA breaches, ready-to-merge PRs, per-maintainer
  queues (including which items got fresh contributor replies), new/flagged/
  stale items, unanswered discussions, and response-time stats.

Both are **stateless and API-only**: every metric (first-response time, 7-day
deltas, SLA clocks) is recomputed from GitHub timelines each run, idempotency
comes from HTML markers in bot comments plus visible assignment/label state,
and PR code is never checked out or executed (no `pull_request_target`).

## Configuration — `.github/maintainers.json`

| Field                              | Meaning                                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maintainers[].github`             | GitHub login; the roster defines who counts as "a maintainer responded".                                                                                                                                          |
| `maintainers[].discord`            | Discord user id (snowflake) for digest @-mentions; `null` → plain bold name.                                                                                                                                      |
| `maintainers[].areas`              | Optional file globs (`**`, `*`, `?`) giving this maintainer routing priority for matching PRs (issues match package names in title/body). Omitted/empty (the default) → assignment is pure least-loaded rotation. |
| `maintainers[].maxOpenAssignments` | Routing skips a maintainer at this many open assignments.                                                                                                                                                         |
| `sla.firstResponseHours`           | Deadline for the first human response on a new item (default 24h).                                                                                                                                                |
| `sla.followUpResponseHours`        | Deadline for answering a follow-up message (default 48h).                                                                                                                                                         |
| `sla.staleAuthorDays`              | Author silence before an item is a nudge/close candidate (default 14d).                                                                                                                                           |
| `spam.*`                           | Drive-by/bounty heuristic: account younger than `maxAccountAgeDays` **and** diff ≤ `maxChangedLines` **and** no linked issue → flagged for human judgment, never auto-acked.                                      |
| `botAllowlist`                     | Logins always treated as bots (excluded from human metrics and acks).                                                                                                                                             |
| `maxCommentsPerRun`                | Safety cap on comments per sweep; overflow defers to the next run.                                                                                                                                                |

## Secrets

- `DISCORD_MAINTAINER_WEBHOOK` — Discord webhook URL for the daily digest
  (Server Settings → Integrations → Webhooks). Without it, the digest lands in
  the workflow step summary only.
- The sweep uses the default `GITHUB_TOKEN` — no extra setup.

## Running locally

```bash
# Dry-run: prints the mutation plan / digest, changes nothing
pnpm maintainer:sweep --dry-run
pnpm maintainer:scorecard --dry-run

# Tests
pnpm test:maintainer
```

Both entries use `GITHUB_TOKEN` if set, else fall back to `gh auth token`.

## Layout

Pure logic (`classify.ts` waiting-on state machine + SLA clocks, `route.ts`
assignment, `metrics.ts` scorecard, `glob.ts`) is fixture-tested and does no
I/O. `collect.ts` (GraphQL, read-only), `actions.ts` (REST mutations),
`discord.ts` (webhook) are the I/O seams; `sweep.ts` / `scorecard.ts` are the
entry points.
