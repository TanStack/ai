---
name: pr-sweep
description: >
  Sweep open (or listed) PRs with up to 100 parallel agents: security-scan outside
  contributors, rebase onto main when behind (push --force-with-lease), approve pending
  first-time-contributor CI when relevant, optionally rebase in-house PRs, and report who
  should review. Supports full, changed-only, behind-only, and conflict-only scopes for
  cheap daily runs. Use when the user runs /pr-sweep (or /pr-inbound-sweep), or
  asks to "sweep PRs", "sweep inbound PRs", "security-check outside PRs",
  "rebase outsider PRs", "rebase our PRs", "approve waiting CI on PRs",
  "daily PR sweep", or "prep external PRs for review".
---

# PR Sweep

Prep PRs for review. Fan out one subagent per PR (cap 100). Default is **dry-run** (report only). Mutating steps require `--apply` (or the user saying "apply" / "go ahead").

## Args

| Invocation                                     | Behavior                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/pr-sweep`                                    | All open non-draft PRs (full audit)                                                                                                       |
| `/pr-sweep 12 34 56`                           | Only those PR numbers                                                                                                                     |
| `/pr-sweep --apply`                            | Full set, then rebase **and push** (`--force-with-lease`)                                                                                 |
| `/pr-sweep --apply 12 34`                      | Rebase **and push** listed PRs only                                                                                                       |
| `/pr-sweep --outside-only`                     | Action target = outside authors only (default for mutations)                                                                              |
| `/pr-sweep --include-in-house`                 | Also rebase/update **in-house** branches (still never merge)                                                                              |
| `/pr-sweep --behind`                           | Only PRs behind base / BEHIND / not up to date                                                                                            |
| `/pr-sweep --conflicts`                        | Only CONFLICTING / DIRTY / dirty merge state                                                                                              |
| `/pr-sweep --changed`                          | Only PRs changed since last snapshot (or `updatedAt` within 24h if no snapshot)                                                           |
| `/pr-sweep --daily`                            | Recommended daily recipe: `--changed` ∪ `--behind` ∪ `--conflicts` ∪ new outside PRs; security-scan new outside; lighter pass on the rest |
| `/pr-sweep --apply --daily --include-in-house` | Daily apply: prep outside + rebase ours when behind/conflicting                                                                           |

Combine freely: `--apply --daily --include-in-house`. Explicit PR numbers always win over filters.

## Modes

- **dry-run (default):** fetch, classify, security-scan, decide relevance / rebase need / CI need / assign recommendation. **No** push, **no** CI approve, **no** comments.
- **apply:** after dry-run logic, **rebase + `git push --force-with-lease` + CI approve** for PRs that pass security and are marked actionable, **in the same turn**. `--apply` on the invocation is consent — do not wait for a second yes. Still **never merge** a PR and **never comment** on a PR. A local rebase with no push is a **failed** apply. Record results in `SWEEP-*.md` only.

## Daily routine (recommended)

### Option A — Grok `/loop` (same machine, session-scoped, expires ~7d)

```text
/loop 1d /pr-sweep --apply --daily --include-in-house
```

Or dry-run every morning and apply only when you say go:

```text
/loop 1d /pr-sweep --daily --include-in-house
```

`/loop` intervals: `Nm` / `Nh` / `Nd` (min 60s). Cancel with `scheduler_list` → `scheduler_delete <id>`.

### Option B — Manual weekday

```text
/pr-sweep --daily --include-in-house          # dry-run first
/pr-sweep --apply --daily --include-in-house  # after skimming plan
```

### What `--daily` processes

Build the **action set** as the union of:

1. **New outside PRs** — open outside non-draft not present in the previous snapshot (full security scan).
2. **Changed** — `updatedAt` newer than last snapshot `sweptAt`, or head SHA changed vs snapshot.
3. **Behind** — `mergeStateStatus` is `BEHIND` or not up to date with default branch.
4. **Conflicts** — `mergeable == CONFLICTING` or `mergeStateStatus` in `DIRTY`, `BLOCKED` with dirty indicators.
5. **CI waiting approval** — outside PRs with first-time-contributor gate (cheap; no full diff if already in snapshot as `security: clean`).

Skip from action set (still note counts in report):

- Drafts (unless listed explicitly)
- `security: alert` from prior snapshot until human clears
- PRs marked `blocked-conflicts` in the last 24h with **no** `updatedAt` change (avoid thrashing)
- Bot version/release PRs (`changeset-release/*`, pure Renovate) unless `--include-bots`

Cost target: daily should touch **tens**, not all open history. Full `/pr-sweep` remains the weekly deep scan.

### Snapshot (enables `--changed` / `--daily`)

Path: `.agent/pr-sweep/snapshot.json`

```json
{
  "repo": "TanStack/ai",
  "sweptAt": "2026-08-10T18:00:00Z",
  "defaultBranch": "main",
  "defaultBranchSha": "abc…",
  "prs": {
    "1069": {
      "author": "mikemikimike",
      "outside": true,
      "headSha": "def…",
      "updatedAt": "2026-08-10T04:01:40Z",
      "security": "clean",
      "mergeable": "MERGEABLE",
      "mergeStateStatus": "UNSTABLE",
      "lastAction": "approve-ci",
      "lastActionAt": "2026-08-10T17:30:00Z"
    }
  }
}
```

Write/update after every run (dry-run or apply). Diff against this file for `--changed`. If missing, treat all open PRs as new for one full pass, then write the snapshot.

## Prerequisites

```bash
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef,owner
```

Stop if not authenticated. Confirm you are in the target repo (or pass `owner/repo` if the user named one).

## Safety (hard rules)

1. **Never merge** a PR.
2. **Never** `git push --force`. Only `git push --force-with-lease`.
3. **Never mutate** on a security finding (`security: "alert"`). Report and stop that PR.
4. **Default action target = outside only.** In-house rebases require `--include-in-house` (or explicit PR numbers that happen to be in-house).
5. **In-house security:** skip malware fan-out unless the PR touches `scripts/`, `.github/workflows/`, lockfiles, or install lifecycle — then light scan only.
6. **Worktrees only** for apply-mode git ops (`spawn_subagent` with `isolation: "worktree"`). Do not checkout foreign branches in the main workspace.
7. Cap concurrent apply subagents at **8** (worktrees + API). Read-only fan-out may go up to **100**.
8. If rebase conflicts cannot be resolved cleanly in under ~10 minutes of agent work, **abort**, leave a note in the report, do not push partial state.
9. `--apply` / "apply" / "go ahead" / "yes" after a dry-run **is consent**. Write the apply plan into the report and mutate immediately. Do not stop for a second yes, including when more than 5 PRs would be mutated. Daily `/loop … --apply` likewise fires without re-prompting.
10. Prefer **rebase** for both outside and in-house. Use merge-from-base only when the agent JSON says so (many merge commits, prior merge strategy).
11. **Push is part of rebase.** After a clean rebase (or merge-from-base), run `git push --force-with-lease` onto the PR head remote, then verify `gh pr view N --json headRefOid` changed. Do not mark the PR done until the remote moved or you recorded `push-403`.
12. **Never comment on a PR.** GitHub already notifies the author on push. A comment from the maintainer reads as a review ping / waiting-on-author. Record rebase/CI results in `.agent/pr-sweep/SWEEP-*.md` only. No `gh pr comment`, no review comments, no issue comments.

## Procedure

### 1. Resolve repo + "us" set

```bash
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
OWNER=$(echo "$OWNER_REPO" | cut -d/ -f1)
REPO=$(echo "$OWNER_REPO" | cut -d/ -f2)
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
DEFAULT_SHA=$(git rev-parse origin/$DEFAULT_BRANCH 2>/dev/null || gh api repos/$OWNER/$REPO/commits/$DEFAULT_BRANCH --jq .sha)
```

Build **in-house logins** (`US`):

1. Org members (if owner is an org):
   ```bash
   gh api orgs/$OWNER/members --paginate --jq '.[].login' 2>/dev/null
   ```
2. Repo collaborators with `admin` or `maintain` or `push`:
   ```bash
   gh api repos/$OWNER/$REPO/collaborators --paginate --jq '.[] | select(.permissions.admin or .permissions.maintain or .permissions.push) | .login'
   ```
3. Logins in `CODEOWNERS` (and resolve teams when cheap).
4. Bots: `dependabot[bot]`, `renovate[bot]`, `github-actions[bot]`, `copilot-swe-agent[bot]`, etc. → in-house.

Author is **outside** if login ∉ `US`.

### 2. List target PRs

```bash
gh pr list --state open --limit 200 \
  --json number,title,url,author,isDraft,baseRefName,headRefName,headRepository,headRepositoryOwner,isCrossRepository,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,labels,additions,deletions,changedFiles,createdAt,updatedAt,assignees,headRefOid
```

(REST fallback if GraphQL 502s.)

Apply filters **in order**:

1. Explicit numbers → use only those.
2. Drop drafts from action set (mention under skipped).
3. If `--conflicts` → keep only conflicting/dirty.
4. If `--behind` → keep only behind/not up to date.
5. If `--changed` → keep only snapshot-diffed changes (or 24h `updatedAt` if no snapshot).
6. If `--daily` → union of new-outside ∪ changed ∪ behind ∪ conflicts ∪ waiting-approval (see Daily).
7. Else → all open non-draft.

If count > 100, process 100 most-recently-updated; list the rest under "Skipped (over budget)".

### 3. Fan-out (read phase)

Spawn up to **100** parallel `general-purpose` subagents. One PR per agent.

**Cheap path (daily / already-clean outside):** if snapshot has `security: clean` and head SHA unchanged and only behind/conflicts flag flipped, skip full `gh pr diff` malware scan — re-fetch mergeability + checks only.

Each agent returns **one JSON object only**:

```json
{
  "number": 123,
  "title": "...",
  "url": "https://github.com/...",
  "author": "login",
  "outside": true,
  "draft": false,
  "security": "clean|alert|review",
  "securityReasons": ["..."],
  "relevant": true,
  "relevanceReason": "<=120 chars",
  "behindBase": true,
  "mergeable": "MERGEABLE|CONFLICTING|UNKNOWN",
  "rebasePlan": "none|rebase|merge-from-base|blocked-conflicts|blocked-security|n/a-skip",
  "ci": {
    "overall": "passing|failing|pending|waiting-approval|none",
    "needsWorkflowApproval": false,
    "failedChecks": [],
    "pendingChecks": []
  },
  "assignForReview": true,
  "assignTo": ["login-or-team"],
  "priority": "P0|P1|P2|P3",
  "actionsPlanned": [
    "security-alert",
    "rebase",
    "push-force-with-lease",
    "approve-ci",
    "none"
  ],
  "blockers": "<=120 chars or empty",
  "summary": "<=160 chars"
}
```

#### Per-PR agent instructions (embed fully)

```
You are auditing GitHub PR <URL> in <OWNER/REPO> for pr-sweep.
Mode: read-only. Do not push, comment, approve, or merge.

1) Fetch:
   gh pr view <N> --json title,body,author,isDraft,baseRefName,headRefName,headRepositoryOwner,isCrossRepository,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,labels,files,additions,deletions,commits,url,assignees,headRefOid
   gh pr checks <N> 2>/dev/null || true
   # Full diff only if: outside AND (new OR security not yet clean in snapshot OR headSha changed)
   gh pr diff <N>   # when required

2) outside: true if author.login not in: <US_LOGINS_CSV>

3) Security:
   - Outside: always for new/changed head; use checklist references/security-checklist.md (next to this SKILL.md)
   - In-house: clean by default unless scripts/CI/lockfile/install lifecycle touched
   security: alert | review | clean

4) relevant + relevanceReason

5) behindBase + rebasePlan:
   - none | rebase | merge-from-base | blocked-conflicts | blocked-security | n/a-skip
   - In-house with --include-in-house: rebasePlan is rebase/merge-from-base/blocked-conflicts (not n/a-skip)
   - In-house without include: rebasePlan n/a-skip

6) CI: overall + needsWorkflowApproval + failed/pending checks

7) assignForReview, assignTo, priority, actionsPlanned

Return ONLY the JSON object on one line.
```

### 4. Aggregate dry-run report

Write `.agent/pr-sweep/SWEEP-YYYY-MM-DD.md` (create dirs). Structure:

```markdown
# PR Sweep — <OWNER/REPO> — <date> — mode: dry-run|apply — scope: full|daily|behind|conflicts|changed

## Security alerts

## Needs human eyes

## Outside PRs — recommended actions

## In-house PRs — recommended actions # when --include-in-house

## Skipped

## Apply plan
```

Also update `snapshot.json` (even on dry-run) with current head SHAs and merge state.

Print a short chat summary: alert count, would-rebase count (outside / in-house), CI approvals, top assign list (max 5), report path.

**If mode is dry-run, stop here** (unless user then says apply).

### 5. Apply mode

`--apply` **is consent**. Write the Apply plan into the report and mutate **in this turn**. Do not wait for another yes.

**Done** for a rebase target = default-branch is an ancestor of the **remote** head SHA (push landed) **or** `result: push-403` is recorded. Local-only rebase = failed apply.

Process PRs that are actionable:

| Author   | Security     | Flag                 | Mutate?                                   |
| -------- | ------------ | -------------------- | ----------------------------------------- |
| outside  | clean        | default              | yes (rebase, approve-ci)                  |
| outside  | alert/review | any                  | **no** (report only)                      |
| in-house | clean        | `--include-in-house` | yes (rebase only; CI approve usually N/A) |
| in-house | —            | no flag              | **no**                                    |

#### 5a. Security gate

If `security != "clean"` → skip mutations.

#### 5b. Rebase / update base (worktree subagent)

`spawn_subagent` with `isolation: "worktree"`, max **8** concurrent. Embed the push + verify steps in the child prompt (completion criterion: remote SHA changed).

```bash
BEFORE=$(gh pr view <N> --json headRefOid --jq .headRefOid)
gh pr checkout <N>
git fetch origin <DEFAULT_BRANCH>
git rebase origin/<DEFAULT_BRANCH>
# only if agent said merge-from-base:
# git merge origin/<DEFAULT_BRANCH>
# conflicts: resolve only clear non-overlapping/import/lockfile/generated cases.
# else: git rebase --abort; result=blocked-conflicts; do not push.

git push --force-with-lease
# Forks: push to the upstream `gh pr checkout` set (often not origin).
# If no upstream: git push --force-with-lease <fork-remote> HEAD:<headRefName>

AFTER=$(gh pr view <N> --json headRefOid --jq .headRefOid)
# MUST: AFTER != BEFORE. If equal, the push did not land — not done.
```

Org-fork 403 (`maintainerCanModify` false): record `push-403`, do not retry loops. Still never `git push --force`.

#### Apply child prompt (embed fully)

```
You are applying pr-sweep to GitHub PR https://github.com/OWNER/REPO/pull/N.
Mode: APPLY in a worktree. Never merge. Never git push --force (lease only). Never comment on the PR.

DONE only when the PR's remote head SHA changed, or you return result=push-403 or blocked-conflicts.
A local rebase with no push is a FAILED apply. Do not stop after rebase.

1. BEFORE=$(gh pr view N --json headRefOid --jq .headRefOid)
2. gh pr checkout N
3. git fetch origin DEFAULT_BRANCH
4. git rebase origin/DEFAULT_BRANCH
   Conflicts: resolve only trivial non-overlapping import/lockfile/generated cases.
   Else git rebase --abort and return blocked-conflicts (no push).
5. git push --force-with-lease
   Forks: push the upstream gh pr checkout configured (often not origin).
   No upstream: git push --force-with-lease <fork-remote> HEAD:<headRefName>
6. AFTER=$(gh pr view N --json headRefOid --jq .headRefOid)
   If AFTER == BEFORE and rebase was not already-current: push did not land — not done.

Return ONLY JSON:
{"number":N,"pushed":true|false,"newHeadSha":"...","result":"rebased-pushed|already-current|blocked-conflicts|push-403|error","blockers":"","summary":""}
```

#### 5c. Approve waiting workflows (outside, relevant, clean)

```bash
gh api -X POST repos/$OWNER/$REPO/actions/runs/<RUN_ID>/approve
```

If 403/404 → note manual approval needed. Do not re-run failing CI unless asked.

### 6. Final report + assignment recommendations

Update the markdown report with **Results**: mutated, still blocked, assign-for-review table.

Do **not** `gh pr edit --add-assignee` unless the user said "assign them".

Offer once (opt-in): publish report as **secret gist**:

```bash
gh gist create .agent/pr-sweep/SWEEP-YYYY-MM-DD.md --desc "PR sweep — <OWNER/REPO> — <date>"
```

Secret is the default — never `--public` unless asked.

Chat closer: ≤5 lines — alerts, actions taken, top PRs to review, report path, gist URL if created.

## Orchestrator tips

- Prefer one read fan-out, then a smaller apply fan-out only for real mutations.
- **Daily first:** load snapshot → filter → only then fan out. Avoid 60-agent full scans every day.
- In-house rebases share the same force-with-lease rules; branches on the origin repo push to `origin`.
- Org-fork push 403s (maintainerCanModify false / org policy): report partial; do not retry loops.
- Cost: <20 PRs → main thread fine; no need for 100 agents.
- Does **not** replace `triage-github` (backlog ranking) or `pr-babysit` (ongoing CI/comment fixing).

## Reference

- Security heuristics: [references/security-checklist.md](references/security-checklist.md)
