# Maintainer toolset

Automation that keeps on top of open PRs, issues, and discussions:

- **Sweep** (`.github/workflows/maintainer-sweep.yml`, every 3h): assigns each
  eligible open PR/issue to a maintainer (drafts and suspected drive-by PRs
  and bot items are skipped), requests the assigned PR maintainer’s review,
  posts a one-time ack comment with a deterministic pre-review checklist, asks
  for a reproduction on bug reports that lack one, and reconciles
  `waiting-on: *` / `ready-to-merge` / `merge-conflicts` / `needs-repro` /
  `has-pr` labels.
- **Scorecard** (`.github/workflows/maintainer-scorecard.yml`, daily): posts a
  to-do digest to Discord — SLA breaches, ready-to-merge PRs, per-maintainer
  queues (including which items got fresh contributor replies), new/flagged/
  stale items, unanswered discussions, response-time stats, and review velocity.

Both are **stateless and API-only**: every metric (first-response time, 7-day
deltas, SLA clocks) is recomputed from GitHub timelines each run, idempotency
comes from HTML markers in bot comments plus visible assignment/label state,
and PR code is never checked out or executed (no `pull_request_target`).

## Configuration — `.github/maintainers.json`

| Field                              | Meaning                                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `maintainers[].github`             | GitHub login; the roster defines who counts as "a maintainer responded".                                                                                                                                                             |
| `maintainers[].discord`            | Discord user id (snowflake) for digest @-mentions; `null` → plain bold name.                                                                                                                                                         |
| `maintainers[].areas`              | Optional file globs (`**`, `*`, `?`) giving this maintainer routing priority for matching PRs (issues match package names in title/body). Among equally loaded maintainers, merged-PR history also supplies file/package experience. |
| `maintainers[].maxOpenAssignments` | Legacy field, ignored by routing. Open-assignment counts never block assignment.                                                                                                                                                     |
| `sla.firstResponseHours`           | Deadline for the first human response on a new item (default 24h).                                                                                                                                                                   |
| `sla.followUpResponseHours`        | Deadline for answering a follow-up message (default 48h).                                                                                                                                                                            |
| `sla.staleAuthorDays`              | Author silence before an item is a nudge/close candidate (default 14d).                                                                                                                                                              |
| `spam.*`                           | Drive-by/bounty heuristic: account younger than `maxAccountAgeDays` **and** diff ≤ `maxChangedLines` **and** no linked issue → flagged for human judgment, never auto-acked.                                                         |
| `botAllowlist`                     | Logins always treated as bots (excluded from human metrics and acks).                                                                                                                                                                |
| `maxCommentsPerRun`                | Safety cap on comments per sweep; overflow defers to the next run.                                                                                                                                                                   |

## Assignment order

1. Route unassigned core-owned PRs first. Read `.github/CODEOWNERS` from the
   default branch through GitHub, including last-match and ownerless exceptions.
   Assign these PRs to `AlemTuzlak`, regardless of load. If Alem authored the PR,
   choose another maintainer with the fewest assigned PRs.
2. Route other unassigned PRs to the least-loaded maintainer who is not the
   author. Break load ties with configured areas and matching files or packages
   from PRs merged in the last 14 days (authored or reviewed by the maintainer).
   Remaining ties use a deterministic rotation based on the item number.
3. Route unassigned issues with a separate issue count. Package names in the
   title/body break load ties using configured areas.

Every eligible item gets an assignee when the roster has someone other than
its author. The old assignment caps no longer apply. Existing assignments stay
in place. Core approval and author exclusions can prevent a perfectly even
split; later assignments fill the smaller queues first.

The sweep requests reviews from PR assignees unless they authored the PR,
already have a pending request, or have submitted a review. This also repairs a
run that assigned a PR but failed before requesting review. It does not keep
re-requesting completed reviews. Dry-run output includes review requests.

## Review velocity

Each maintainer's digest queue includes:

- **Reviews/7d:** submitted reviews in the last seven days across open PRs and
  PRs closed in the 14-day lookback. Repeat reviews count as separate completed
  reviews; comments, pending reviews, bots, and self-reviews do not count.
- **Median first review:** hours from the earliest assignment or review request
  to that maintainer's first submitted review on a PR. The first review must
  fall in the last seven days. Repeated requests do not reset the clock.
- **Sample count:** PRs with both timestamps. Reviews without a preceding
  assignment/request count toward throughput, but have no latency sample.

PR files, review requests, and review timelines are paginated, so a core-owned
path or first review beyond the first page is included. Assignment/request
activity does not count as a conversation reply or reset SLA clocks.

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
