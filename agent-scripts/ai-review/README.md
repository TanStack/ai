# Grok PR review bot

A GitHub Action that reviews open pull requests with TanStack AI (`chat()` + `grokBuildText('grok-4.6')`). It comments, sets one `ai-*` label, and can push listed polish commits.

The first lines of every bot comment say the comment is automated. It is not a maintainer review. The bot never GitHub-approves and never merges.

## What you need

1. A machine GitHub user with write access on this repo.
2. A PAT for that user, stored as repo secret `AI_REVIEW_TOKEN`.
3. An xAI key, stored as repo secret `XAI_API_KEY`.
4. Set `AI_REVIEW_MACHINE_USER` in the workflow to that user's login (default `tanstack-ai-bot`).

Until both secrets exist, the job fails with `missing AI_REVIEW_TOKEN or XAI_API_KEY`. It does not comment as `github-actions[bot]`.

## How a run starts

- Auto: `pull_request` opened, synchronize, or ready_for_review, when the PR is not a draft.
- Auto does not start when the PR author is OWNER, MEMBER, or COLLABORATOR. GitHub then shows a skipped check, not a cancelled check.
- Manual: Actions `workflow_dispatch` with a PR number.
- Manual: a login in `.github/maintainers.json` comments `/ai-review` on the PR.

Auto also skips drafts, bot PRs, roster-maintainer PRs, the machine user's own head commit, and a head SHA this bot already reviewed. Manual still runs on those. The bot never executes PR code.

## Labels

The bot sets exactly one of these. It removes the other two. It never touches `ready-to-merge`.

| Label           | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `ai-rejected`   | Not useful, or it does not fix the claimed bug.                        |
| `ai-needs-work` | Listed fixes are not on the branch (no push, or maintainer edits off). |
| `ai-ready`      | The bot thinks a maintainer can merge after they Approve.              |

## Local run

```bash
pnpm test:ai-review
```

A full agent run needs `AI_REVIEW_TOKEN`, `XAI_API_KEY`, `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, and `AI_REVIEW_WORKTREE` pointing at a checkout of the PR head. Do not run `pnpm install` in that worktree.

## Failed run

Open the **AI review** workflow log. Common causes:

- Missing `AI_REVIEW_TOKEN` or `XAI_API_KEY`
- Fork with maintainer edits off (comment is posted, label is `ai-needs-work`, no push)
- `chat()` did not return a valid verdict object
- Workspace setup failed to install the Grok CLI

## Layout

Code lives in `agent-scripts/ai-review/`, not under `scripts/`. The maintainer sweep stays in `scripts/maintainer/` and does not review diffs.
