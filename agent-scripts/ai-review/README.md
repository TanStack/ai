# Grok PR review bot

A GitHub Action that reviews open pull requests with TanStack AI (`chat()` + `grokBuildText('grok-4.6')`). It comments, sets one `ai-*` label, and can push listed polish commits.

Auto review runs on a cron sweep, not on the `pull_request` event. A fork's `pull_request` event gets no repo secrets, so the job could never start on the PRs that most need it.

The first lines of every bot comment say the comment is automated. It is not a maintainer review. The bot never GitHub-approves a review and never merges.

## What you need

1. A machine GitHub user with write access on this repo.
2. A PAT for that user, stored as repo secret `AI_REVIEW_TOKEN`. The PAT needs `repo` so it can approve waiting Actions runs.
3. An xAI key, stored as repo secret `XAI_API_KEY`.
4. The bot reads its own login from the token. `AI_REVIEW_MACHINE_USER` overrides it on the manual path (default `tanstack-ai-bot`).

Until both secrets exist, the job fails with `missing AI_REVIEW_TOKEN or XAI_API_KEY`. It does not comment as `github-actions[bot]`.

## How a run starts

- Auto: the sweep runs every 30 minutes. It lists open PRs and reviews the ones it has not reviewed at that head SHA yet.
- Manual: Actions `workflow_dispatch` with a PR number.
- Manual: a login in `.github/maintainers.json` comments `/ai-review` on the PR.

The sweep skips drafts, bot PRs, roster-maintainer PRs (keep those logins in `.github/maintainers.json`), the machine user's own head commit, and a head SHA this bot already reviewed. Manual still runs on those. The bot never executes PR code.

Each sweep run reviews at most `AI_REVIEW_SWEEP_LIMIT` PRs, newest activity first. The default is 3. The rest wait for the next run. One failed review does not stop the others; the run still exits non-zero.

After a clean `ai-ready` scan, the bot approves the waiting Test checks.

## Labels

The bot does not auto-approve workflows when the PR changes a workflow file.

The bot sets exactly one of these verdict labels. It removes the other two. It never touches `ready-to-merge`.

When the verdict is `ai-ready` and a host scan finds no malware, the bot adds `secure`. Then it approves waiting first-time-contributor workflow runs. A maintainer can Approve and merge without clicking **Approve and run workflows** first.

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

A single manual run (`pnpm ai-review`) needs `AI_REVIEW_TOKEN`, `XAI_API_KEY`, `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, and `AI_REVIEW_WORKTREE` pointing at a checkout of the PR head. Do not run `pnpm install` in that worktree.

The sweep (`pnpm ai-review:sweep`) needs `AI_REVIEW_TOKEN` and `XAI_API_KEY` only. It makes its own worktree per PR under the repo root and removes it after.

## Failed run

Open the **AI review** workflow log. The job prints text, reasoning, tool input/output, and the verdict. It does not print raw chunks.

Common causes:

- Missing `AI_REVIEW_TOKEN` or `XAI_API_KEY`
- Fork with maintainer edits off (comment is posted, label is `ai-needs-work`, no push)
- `git fetch origin pull/<n>/head` failed, so the sweep could not make the worktree
- `chat()` did not return a valid verdict object
- Workspace setup failed to install the Grok CLI

## Layout

Code lives in `agent-scripts/ai-review/`, not under `scripts/`. The maintainer sweep stays in `scripts/maintainer/` and does not review diffs.
