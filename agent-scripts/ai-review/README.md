# Grok PR review bot

A GitHub Action that reviews open pull requests with TanStack AI (`chat()` + `grokBuildText('grok-4.6')`). It comments, sets one `ai-*` label, and can push listed polish commits.

It runs as **two jobs**, and the split is the security boundary:

| Job       | Runs the agent              | Holds `AI_REVIEW_TOKEN` | Writes to GitHub |
| --------- | --------------------------- | ----------------------- | ---------------- |
| `review`  | yes, over untrusted PR code | **no**                  | no               |
| `publish` | no                          | yes                     | yes              |

The agent runs with tool approval disabled, so the review job is the one that could be turned against us. It is given no repo credential to steal — only `XAI_API_KEY` and the read-only `GITHUB_TOKEN`. It writes its verdicts to an artifact. The publish job picks that up, holds the PAT, and does every comment, label, approval, and push, without ever running the agent or executing PR code.

The publish job treats that artifact as hostile. It re-derives which PRs were eligible and re-runs the malware scan from the API, and it resolves the head SHA, ref, and repo itself. So a compromised review job can mislabel a PR the sweep already picked and push a diff to that PR's own branch — it cannot fake a clean scan, introduce a PR, or choose where a push lands. See the header of `results.ts`.

Auto review runs on a cron sweep, not on the `pull_request` event. A fork's `pull_request` event gets no repo secrets, so the job could never start on the PRs that most need it.

The first lines of every bot comment say the comment is automated. It is not a maintainer review. The bot never GitHub-approves a review and never merges.

## What you need

1. A machine GitHub user with write access on this repo.
2. A PAT for that user, stored as repo secret `AI_REVIEW_TOKEN`. The PAT needs `repo` so it can approve waiting Actions runs.
3. An xAI key, stored as repo secret `XAI_API_KEY`.
4. `AI_REVIEW_MACHINE_USER` set to that user's login (default `tanstack-ai-bot`). The review job cannot call `/user`, so it reads the login from here; the publish job resolves it from the token.

The publish job fails with `missing AI_REVIEW_TOKEN` until the secret exists. It does not comment as `github-actions[bot]`.

## How a run starts

- Auto: the sweep runs every 30 minutes. It lists open PRs and reviews the ones it has not reviewed at that head SHA yet.
- Manual: Actions `workflow_dispatch` with a PR number.
- Manual: a login in `.github/maintainers.json` comments `/ai-review` on the PR.

The sweep skips drafts, bot PRs, roster-maintainer PRs (keep those logins in `.github/maintainers.json`), the machine user's own head commit, and a head SHA this bot already reviewed. Manual still runs on those. The bot never executes PR code.

No human step gates a run, so the scan does. Order, per PR:

In the `review` job:

1. **Pin the commit.** The worktree is fetched before the PR is read over REST. If the two disagree the run stops with `head-moved` and does nothing else, so the scan and the review can never straddle a force-push. The next sweep picks up the new head and scans it from scratch.
2. **Scan.** The host malware scan reads the REST file list, not the PR head. A PR that trips it is never read or edited by the agent.
3. **Review.** The agent reads and edits the pinned commit. Its edits are captured as a patch, not pushed.

In the `publish` job:

4. **Re-scan.** Authoritative. A PR that trips it gets the reasons, `ai-rejected`, and no approvals — whatever the review job claimed.
5. **Release the other workflows.** A clean scan adds `secure` and approves waiting first-time-contributor runs on that commit. It does not depend on the AI verdict: a PR the agent rejects still gets its CI.
6. **Comment and label,** and apply the polish patch onto the head it resolved, pushed under a lease pinned to that SHA so a branch that moved is refused rather than overwritten.

Nobody can bless a PR into skipping the scan, and a pass never carries to another commit: it is earned per head SHA, by the scan alone.

Each sweep run reviews at most `AI_REVIEW_SWEEP_LIMIT` PRs, newest activity first. The default is 3. The rest wait for the next run. One failed review does not stop the others; the run still exits non-zero.

## Labels

The bot does not auto-approve workflows when the PR changes a workflow file. Such a PR is rejected before review, not merely left unapproved.

The bot sets exactly one of these verdict labels. It removes the other two. It never touches `ready-to-merge`.

When the host scan finds no malware, the bot adds `secure` and approves waiting first-time-contributor workflow runs, whatever the review verdict turns out to be. A maintainer can Approve and merge without clicking **Approve and run workflows** first.

| Label           | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `ai-rejected`   | Not useful, or it does not fix the claimed bug.                        |
| `ai-needs-work` | Listed fixes are not on the branch (no push, or maintainer edits off). |
| `ai-ready`      | The bot thinks a maintainer can merge after they Approve.              |
| `secure`        | Host scan found no malware. The bot approved waiting workflow runs.    |

## Local run

```bash
pnpm test:ai-review
```

A single manual review (`pnpm ai-review`) needs `XAI_API_KEY`, a readable `GITHUB_TOKEN`, `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, and `AI_REVIEW_WORKTREE` pointing at a checkout of the PR head. Do not run `pnpm install` in that worktree.

The sweep (`pnpm ai-review:sweep`) needs `XAI_API_KEY` and a readable token only. It makes its own worktree per PR under the repo root and removes it after.

Both write `AI_REVIEW_RESULTS` (default `ai-review-results.json`). Then `pnpm ai-review:publish` reads it and does the GitHub writes; that one needs `AI_REVIEW_TOKEN` and no model key.

## Failed run

Open the **AI review** workflow log. The job prints text, reasoning, tool input/output, and the verdict. It does not print raw chunks.

Common causes:

- Missing `AI_REVIEW_TOKEN` (publish job) or `XAI_API_KEY` (review job)
- Fork with maintainer edits off (comment is posted, label is `ai-needs-work`, no push)
- `git fetch origin pull/<n>/head` failed, so the sweep could not make the worktree
- The head moved between the fetch and the REST read, so the run stopped with `head-moved`
- `chat()` did not return a valid verdict object
- The results artifact was malformed, so the publish job refused it
- Workspace setup failed to install the Grok CLI

## Layout

Code lives in `agent-scripts/ai-review/`, not under `scripts/`. The maintainer sweep stays in `scripts/maintainer/` and does not review diffs.
