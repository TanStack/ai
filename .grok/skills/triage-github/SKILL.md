---
name: triage-github
description: Triage all open GitHub issues, PRs, and discussions in the current repository by fanning out up to 100 parallel subagents (one per item), then produce a single prioritized report ranking which PRs to review first, which issues to address first, and which discussions need maintainer attention. Use when the user asks to "triage open issues/PRs", "triage discussions", "prioritize the backlog", "what should I review first", "sweep the repo", or any request to bulk-evaluate open GitHub work and recommend an order.
---

# Triage GitHub Issues, PRs & Discussions in Parallel

## When to use

The user wants a prioritized view of everything open on the current repo's GitHub: which PRs to merge/review first, which issues to fix first, and which discussions need maintainer engagement. Trigger phrases include "triage the backlog", "what should I look at first", "prioritize open PRs and issues", "sweep open work", "triage discussions".

Do **not** invoke for single-item review (just look at it directly) or when the user wants ongoing automation (use `/schedule` instead).

## Prerequisites

- `gh` CLI is authenticated (`gh auth status`). If not, stop and ask the user to authenticate — do not attempt to fix auth automatically.
- Run from inside a git repo whose `origin` points at the GitHub repo to triage. Confirm with `gh repo view --json nameWithOwner,hasDiscussionsEnabled`.
- If `hasDiscussionsEnabled` is `false`, skip the discussions section entirely (don't fetch, don't include in budget, note in report that discussions are disabled).

## Procedure

### 1. Fetch open work

Run these `gh` calls in parallel. Use JSON so the downstream agent prompts are self-contained. The discussions call is a GraphQL query because `gh` has no built-in `discussion list` command.

```bash
gh pr list --state open --limit 200 --json number,title,url,author,assignees,createdAt,updatedAt,isDraft,mergeable,reviewDecision,labels,additions,deletions,changedFiles,statusCheckRollup

gh issue list --state open --limit 200 --json number,title,url,author,createdAt,updatedAt,labels,comments,reactionGroups

gh api graphql -f query='
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    discussions(first: 100, orderBy: {field: UPDATED_AT, direction: DESC}, states: OPEN) {
      totalCount
      nodes {
        number
        title
        url
        createdAt
        updatedAt
        upvoteCount
        isAnswered
        locked
        category { name }
        author { login }
        labels(first: 5) { nodes { name } }
        comments(first: 0) { totalCount }
        reactions { totalCount }
      }
    }
  }
}' -F owner=<OWNER> -F name=<REPO>
```

Substitute `<OWNER>` and `<REPO>` from `gh repo view --json nameWithOwner`.

If the combined total exceeds 100 items, tell the user the counts (PRs / issues / discussions) and ask whether to cap at 100 most-recently-updated or split into batches. The agent cap is 100 total across all three categories.

### 2. Decide the parallel split

- Count `nPRs`, `nIssues`, `nDiscussions`.
- If `nPRs + nIssues + nDiscussions <= 100`: spawn one agent per item.
- Otherwise: prioritize PRs first (they block contributors), then issues by most-recently-updated, then discussions by most-recently-updated, up to the 100 budget. Note in the final report which items were skipped.

### 3. Fan out subagents

Dispatch **all agents in a single message** using multiple `Agent` tool calls (Claude Code parallelizes when they're in one block). Use `subagent_type: "general-purpose"` and `run_in_background: false` — you need the results synchronously to write the report.

Per-PR prompt template (substitute the bracketed values):

```
Triage GitHub PR [URL]. You have read-only access via `gh` and web tools.

Gather:
- `gh pr view [NUMBER] --json title,body,author,assignees,createdAt,updatedAt,isDraft,mergeable,mergeStateStatus,reviewDecision,labels,additions,deletions,changedFiles,statusCheckRollup,comments,closingIssuesReferences`
- `gh pr diff [NUMBER]` (skim — don't dump it)
- Recent review comments if any

`closingIssuesReferences` is GitHub's authoritative "this PR closes #X" linkage (populated by closing keywords like `Closes #123`). Put those issue numbers in `closesIssues`. Also scan the PR body/title for issue references that use closing keywords but weren't auto-linked (cross-repo, typos) and include those too. `assignees` is the array of assigned logins (may be empty).

Return ONLY a JSON object on a single line (no prose, no fences), matching:
{"kind":"pr","number":N,"title":"...","url":"...","author":"...","assignees":["login",...],"closesIssues":[N,...],"ageDays":N,"sizeLOC":N,"ciStatus":"passing|failing|pending|none","mergeable":true|false,"reviewState":"approved|changes_requested|review_required|none","draft":true|false,"priority":"P0|P1|P2|P3","reason":"<=140 chars","blockedBy":"<=80 chars or empty","recommendedAction":"merge|review|request-changes|close|wait"}

Priority rubric:
- P0: ready-to-merge (approved + green CI + mergeable + non-draft), or fixes broken main
- P1: small/focused, passing CI, needs review; or bug fix with clear reproduction
- P2: feature work, larger diff, no blockers
- P3: draft, stale (>30 days no activity), or has unresolved conflicts/failures

Be terse. One JSON object. No commentary.
```

Per-issue prompt template:

```
Triage GitHub issue [URL]. Read-only access via `gh`.

Gather:
- `gh issue view [NUMBER] --json title,body,author,createdAt,updatedAt,labels,comments,reactionGroups,assignees`
- Cross-referenced/linked PRs from the timeline: `gh api "repos/<OWNER>/<REPO>/issues/[NUMBER]/timeline" --jq '[.[] | select(.event=="cross-referenced" and .source.issue.pull_request != null) | .source.issue.html_url] | unique'` (substitute `<OWNER>`/`<REPO>`). Any URL returned is a PR that references this issue — capture it in `linkedPR`.
- Skim comments for repro steps, workarounds, and any "fixed by #NNN" / PR links

Set `linkedPR` to the URL of an open PR that addresses this issue if one exists (from the timeline query or comments), else empty. This is used to dedup: issues with a linked PR are folded under that PR in the report. `assignees` is the array of assigned logins (may be empty).

Return ONLY a JSON object on one line:
{"kind":"issue","number":N,"title":"...","url":"...","author":"...","assignees":["login",...],"ageDays":N,"reactions":N,"comments":N,"hasRepro":true|false,"linkedPR":"<url or empty>","category":"bug|feature|docs|question|chore","priority":"P0|P1|P2|P3","reason":"<=140 chars","recommendedAction":"fix|investigate|answer|close|wait-for-info"}

Priority rubric:
- P0: regression / data loss / security / blocks many users (high reactions + recent activity)
- P1: confirmed bug with reproduction, or high-engagement feature request
- P2: feature requests, minor bugs, docs gaps
- P3: questions, unreproducible, no activity in 60+ days

One JSON object. No commentary.
```

Per-discussion prompt template:

```
Triage GitHub discussion [URL]. Read-only access via `gh api graphql`.

Gather:
- `gh api graphql -f query='{ repository(owner:"<OWNER>", name:"<REPO>") { discussion(number: [NUMBER]) { title body url createdAt updatedAt upvoteCount isAnswered locked category { name } author { login } labels(first: 10) { nodes { name } } comments(first: 30) { totalCount nodes { author { login } body createdAt isAnswer upvoteCount } } reactions { totalCount } } } }'`
- Skim body + comments for: maintainer engagement, repro steps that suggest a real bug, and any links to issues/PRs (`#NNN` or full github.com/.../issues|pull/NNN URLs)

If the discussion body or comments reference an existing issue or PR that tracks it (or it was converted to an issue), capture that URL in `linkedIssueOrPR`, else empty. This is used to dedup: discussions already tracked by an issue or PR are folded away and only surface if unlinked.

Return ONLY a JSON object on one line:
{"kind":"discussion","number":N,"title":"...","url":"...","author":"...","linkedIssueOrPR":"<url or empty>","category":"Q&A|Ideas|General|Show and tell|Announcements|Polls|other","ageDays":N,"updatedDaysAgo":N,"upvotes":N,"comments":N,"reactions":N,"isAnswered":true|false|null,"maintainerEngaged":true|false,"looksLikeBug":true|false,"priority":"P0|P1|P2|P3","reason":"<=140 chars","recommendedAction":"answer|convert-to-issue|engage|mark-answered|close|wait"}

Priority rubric (category-aware):
- Q&A:
  - P0: unanswered AND (looksLikeBug OR upvotes>=5 OR ageDays>=7 with no maintainer reply)
  - P1: unanswered with clear question, some engagement, recent
  - P2: recently asked, no engagement yet, awaiting community signal
  - P3: effectively answered but not marked, stale (60+ days), or low-effort
- Ideas:
  - P0: upvotes>=10 AND updatedDaysAgo<=14 — strong roadmap demand
  - P1: upvotes>=3 with clear scope, or moderate engagement
  - P2: legitimate idea, low engagement so far
  - P3: stale, duplicate, off-roadmap, or off-topic
- General / Show and tell / Announcements / Polls / other:
  - P1: high engagement (upvotes+comments>=10) and recent — surfaces trends
  - P2: normal engagement
  - P3: low engagement, off-topic, or stale (60+ days)

Notes for recommendedAction:
- "convert-to-issue" if looksLikeBug is true and no linked issue exists
- "answer" for unanswered Q&A
- "mark-answered" for Q&A where a comment clearly answers but isAnswered is false
- "engage" for high-signal Ideas needing maintainer feedback
- "close" for off-topic, duplicate, or out-of-scope
- "wait" if community signal is still forming

One JSON object. No commentary.
```

### 4. Aggregate

Collect every agent's JSON line. If an agent returned prose instead of JSON (rare), extract what you can or mark `priority: "P3", reason: "agent parse failed"`.

#### 4a. Build the linkage/dedup map (do this BEFORE sorting)

The report is a strict hierarchy — **PRs > issues > discussions**. Each unit of work appears **once**, in the highest tier that covers it. A PR outranks the issue it closes; an issue outranks the discussion that spawned it.

1. **`coveredIssues`** = the union of every PR's `closesIssues`, PLUS every issue whose own `linkedPR` is non-empty. These issues are represented by a PR, so they are **removed from the Issues section**.
2. For each PR, attach the human-readable `closes #X[, #Y]` list from its `closesIssues`. Pull each closed issue's title from the issue results (if that issue was triaged) so the PR line can name what it closes.
3. **`coveredDiscussions`** = every discussion whose `linkedIssueOrPR` is non-empty. These are tracked elsewhere, so they are **removed from the Discussions section**.
4. Keep a short "Folded away" tally (counts only) so the report can note how many issues/discussions were hidden because a PR/issue already covers them.

Edge cases:

- A PR closing an issue that is itself **closed/not in the open set** — still list `closes #X` on the PR (it's informative), just don't try to fetch a title.
- An issue with a `linkedPR` pointing at a PR that is **not open** (already merged/closed) — treat the issue as still open work: keep it in the Issues section, but note the merged PR in its reason. Only fold an issue away when the linked PR is **open**.
- Two PRs closing the same issue (competing fixes) — list the issue under both PRs; fold the issue once.

#### 4b. Sort

1. PRs by priority (P0→P3), then by `ageDays` ascending within each tier (newer first for P0/P1 to capture momentum; for P3 by oldest first — those are stalest).
2. Issues (after removing `coveredIssues`) by priority, then by `reactions + comments` desc within each tier.
3. Discussions (after removing `coveredDiscussions`) by priority, then by `upvotes * 2 + comments + reactions` desc within each tier. Inside the same tier, surface Q&A above Ideas above other categories (response latency matters most for Q&A).

#### 4c. Compute deltas vs the previous run

**Triage data dir.** Machine-readable snapshots live in a stable directory so runs can be compared: use `.agent/triage/` if the repo has a `.agent/` directory, else `.triage/` at the repo root (create it, and add `/.triage/` to `.gitignore` if not already ignored). These snapshots are local working data — never commit them.

Find the most recent snapshot `triage-*.json` in that dir whose date is **before today** (ignore any from today so a same-day re-run doesn't diff against itself). If none exists, skip deltas and note "first tracked run — no prior snapshot to compare" in the report.

Otherwise load it. Each snapshot is `{ "date", "repo", "items": [ <agent JSON> + "highStreak": N ] }`. Match items across runs by `kind` + `number` and compute:

- **New** — in current, not in prior.
- **Resolved** — in prior, not in current (merged / closed / answered since last run).
- **Escalated** — priority increased (e.g. `P2 → P0`). Record `old → new`.
- **De-escalated** — priority decreased.
- **Recurring high priority** — `highStreak >= 2` (see below): P0/P1 now and also high-priority last run. A P0 that recurs across runs is being ignored despite "act today" — the single most actionable delta signal.

**`highStreak`** propagates the streak so you don't need full history: when building the current snapshot, for each item look up its prior entry. If the item is P0/P1 **and** its prior entry was P0/P1, set `highStreak = priorHighStreak + 1`; otherwise `highStreak = 1`. Store it on each current item.

Deltas are additive — they never change an item's score or its placement in the sections below. If the prior snapshot is missing or unparseable, skip the delta section entirely rather than guessing; do **not** fabricate a comparison.

### 5. Write the snapshot, then the report

First write the machine-readable snapshot to `<triage data dir>/triage-YYYY-MM-DD.json` (the dir from 4c) — `{ "date", "repo", "items": [...] }`, one entry per triaged item (the agent's JSON verbatim plus the computed `highStreak`). This is the source of truth the next run diffs against; the markdown report is human-facing only. Overwrite today's snapshot if re-running.

Then save the human report to `TRIAGE_REPORT.md` at the repo root (or `.agent/triage/TRIAGE_REPORT-YYYY-MM-DD.md` if the repo has a `.agent/` directory). Ask before overwriting an existing report from today.

Report skeleton:

```markdown
# Triage Report — <repo nameWithOwner> — <YYYY-MM-DD>

Scanned **N PRs**, **M issues**, and **D discussions**. Folded away **X issues** covered by an open PR and **Y discussions** already tracked by an issue/PR (they appear under the covering item, not in their own section). Skipped K items over the 100-agent budget (listed at bottom).

PR lines carry the metadata format: **by @author** · **assigned @assignee1, @assignee2** (or _unassigned_) · **closes #X** (when the PR closes an issue).

## What changed since <prior date>

_Diffed against the previous snapshot (<prior date>). Omit this whole section on the first tracked run._

- **New (<count>):** [#NUM Title](url) _(pr/issue/discussion, P0)_, …
- **Resolved (<count>):** [#NUM Title](url), … — open last run, now merged/closed/answered.
- **Escalated (<count>):** [#NUM Title](url) **P2 → P0**, … — priority rose; look here first.
- **De-escalated (<count>):** [#NUM Title](url) **P0 → P2**, …
- **Recurring high priority (<count>):** [#NUM Title](url) — **P0 for 3 consecutive runs**, still _<action>_, … — keeps surfacing without resolution.

## PRs to review first

### P0 — merge/fix today

- [#NUM Title](url) — by @author · assigned @assignee (or _unassigned_) · closes #X — <reason>. _Action: <recommendedAction>_

### P1 — review this week

- [#NUM Title](url) — by @author · assigned @assignee · closes #X — <reason>. _Action: <recommendedAction>_

### P2 — when time permits

<one-line per item, same by/assigned/closes prefix>

### P3 — needs author input or close

<one-line per item, same by/assigned/closes prefix>

## Issues to address first

_Only issues with **no open PR** addressing them. Issues that a PR already closes are folded under that PR above._

### P0 — fix now

- [#NUM Title](url) — assigned @assignee (or _unassigned_) — <reason>. _Action: <recommendedAction>_

### P1 — schedule this sprint

- [#NUM Title](url) — assigned @assignee — <reason>. _Action: <recommendedAction>_

### P2 — backlog

<one-line per item, with assignee>

### P3 — close or ask for info

<one-line per item, with assignee>

## Discussions to engage with

_Only discussions **not already tracked** by an issue or PR._

### P0 — respond today

- [#NUM Title](url) _(<category>)_ — <reason>. _Action: <recommendedAction>_

### P1 — respond this week

- [#NUM Title](url) _(<category>)_ — <reason>. _Action: <recommendedAction>_

### P2 — when time permits

<one-line per item, prefix with category>

### P3 — close, mark answered, or let community drive

<one-line per item, prefix with category>

## Skipped (over budget)

<list any items not triaged>

## How this was generated

N parallel triage agents ran via the `triage-github` skill on <date>. Each agent independently scored its item; this report aggregates and ranks them, then applies a PR > issue > discussion linkage pass so each unit of work appears once under the highest tier that covers it (a PR's `closesIssues` and each issue's `linkedPR` drive the folding). A machine-readable snapshot was written to `<triage data dir>/triage-<date>.json`; the "What changed" section above diffs this run against the most recent prior snapshot. Priorities are heuristic — sanity-check P0s before acting, especially `convert-to-issue` and `close` recommendations on discussions.
```

If discussions are disabled on the repo, omit the "Discussions to engage with" section and add a one-liner near the top noting they're disabled.

### 6. Summarize for the user

After writing the file, give the user a 3–5 line summary: total counts (plus how many issues/discussions were folded under a covering PR/issue), top 3 PRs to review, top 3 issues to fix, top 3 discussions to engage with, and the report path. Do not paste the full report into chat.

### 7. Offer to publish as a secret gist (opt-in)

The report stays local by default. After the summary, offer once:

> Report saved to `<path>`. Want me to publish it as a **secret gist** to share? Note: a secret gist is _unlisted, not private_ — anyone with the link can read it, and the report names contributors next to candid verdicts (`close`, `low-effort`, etc.).

Only if the user says yes **that run**, publish the markdown report (never the JSON snapshot):

```bash
gh gist create <report-path> --desc "Triage report — <repo nameWithOwner> — <YYYY-MM-DD>"
```

Secret is the `gh gist create` default — do **not** pass `--public`. Print the returned URL back to the user. If the call fails with a scope error, tell the user to run `gh auth refresh -s gist` and re-run; don't try to work around it.

Do not create the gist pre-emptively, on a schedule, or without an explicit yes — it is the one outward-facing action this skill can take, and it must be user-initiated on each run.

## Notes

- **Cost**: 100 agents is expensive. If the combined open-item total is small (say <20), just triage them yourself in the main thread instead of fanning out — mention this and proceed.
- **Rate limits**: `gh` shares one auth token; 100 concurrent `gh` calls usually fits inside GitHub's per-hour quota for authenticated users, but if the user has run heavy `gh` traffic recently, batch the agents in two waves of 50. Discussion GraphQL queries cost more rate-limit points per call than REST — factor that in.
- **Failed agents**: if an agent times out or returns garbage, include it in the report under a "Triage failures" subsection rather than silently dropping it.
- **Snapshots & deltas**: each run writes a `triage-<date>.json` snapshot to the triage data dir (`.agent/triage/` or `.triage/`); the next run diffs against the latest prior one to produce the "What changed" section. Snapshots are local-only working data — gitignore them, and delete freely (deleting just disables deltas for the next run). If no prior snapshot exists or it won't parse, the run proceeds without a delta section rather than guessing.
- **Don't take actions**: this skill is read-only. Do not close issues, request changes, merge PRs, comment on discussions, convert discussions to issues, or post any reply. The report is for the human to act on. The **only** exception is the opt-in secret gist in step 7 — an explicit, user-initiated publish of the report itself; it never happens automatically.
- **Discussion category names** vary per repo. The common GitHub defaults are Q&A, Ideas, General, Show and tell, Announcements, Polls. Unknown categories should be tagged as `"other"` and ranked under the General rubric.
