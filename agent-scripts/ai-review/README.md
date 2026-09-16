# Grok PR review bot

A GitHub Action that reviews open pull requests with TanStack AI (`chat()` + `grokBuildText('grok-4.6')`). It comments, sets one `ai-*` label, and can push listed polish commits.

The first lines of every bot comment say the comment is automated. It is not a maintainer review. The bot never GitHub-approves a review and never merges.

## What you need

1. A machine GitHub user with write access on this repo.
2. A PAT for that user, stored as repo secret `AI_REVIEW_TOKEN`. The PAT needs `repo` so it can approve waiting Actions runs.
3. An xAI key, stored as repo secret `XAI_API_KEY`.
4. Set `AI_REVIEW_MACHINE_USER` in the workflow to that user's login (default `tanstack-ai-bot`).
5. Docker on the review runner.

Until both secrets exist, the job skips green. It does not comment as `github-actions[bot]`.

## How a run starts

Two workflows split the job. `ai-review-signal` runs on every PR event with no secrets and only signals. Its completion starts `ai-review` on the base branch with secrets. No `pull_request_target` anywhere.

Auto: the signal fires on opened, synchronize, ready_for_review, and labeled for PRs that target `main`. Auto skips drafts, bot PRs, roster-maintainer PRs, the machine user's own head commit, and a head SHA this bot already reviewed. The bot never executes PR code.

Manual: a run with the `ai-review` label on the PR, a `/ai-review` comment, or Actions `workflow_dispatch` bypasses the auto-only draft, author, and reviewed-SHA skips. Keep the label on the PR to re-review every push. Remove it to stop.

A first-time fork PR needs one workflow approval. After any merged commit or PR, later runs are automatic.

After a clean `ai-ready` scan, the bot approves the waiting Test checks.

## Security boundary

Before a new audit, the host removes stale `secure` and `ai-ready` labels. An automatic run for a draft also removes these labels, even when its SHA is unchanged. It checks the PR before it starts Grok. The check fails closed when it finds:

- A missing GitHub patch
- A symlink, submodule, or new executable file
- A changed workflow, agent instruction, hook, action, or release script
- A new dependency in a `package.json` file
- A lockfile change
- A shell download, encoded PowerShell command, or reverse shell

Grok clones the exact PR commit into a disposable Docker container. The container does not receive `AI_REVIEW_TOKEN`, mount host files, or get a `host.docker.internal` alias. It receives `XAI_API_KEY` and has network access because Grok needs the xAI API. The Docker provider cannot restrict network destinations. Docker protects the host token and files, but it does not protect the xAI key from code inside the container.

Grok edits only its container clone. The host receives a unified diff after the review. Before the host applies that diff, it rejects large or malformed patches, sensitive files, package files, lockfiles, symlinks, binaries, path traversal, and the exact sandbox secret. Each file needs its own matching headers and complete hunks. The host then runs `git apply --check` before it applies, commits, or pushes the patch.

Before it publishes a verdict, the host checks that the PR still targets `main` and has the expected head SHA. After a polish push, the expected SHA is the new commit. A changed head receives no verdict from the old review.

## Labels

The `ai-review` label opts a PR into a manual review on every push. The bot does not remove that label. The bot does not auto-approve workflows when the PR changes a workflow file.

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

A full agent run needs Docker, `AI_REVIEW_TOKEN`, `XAI_API_KEY`, `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, and `AI_REVIEW_WORKTREE` set to the path where a temporary PR worktree can be created. Do not run `pnpm install` in that worktree.

## Failed run

Open the **AI review** workflow log. The job prints text, reasoning, tool input/output, and the verdict. It does not print raw chunks.

Common causes:

- Missing `AI_REVIEW_TOKEN` or `XAI_API_KEY` (the job skips green, no review)
- Fork with maintainer edits off (comment is posted, label is `ai-needs-work`, no push)
- `chat()` did not return a valid verdict object
- Workspace setup failed to install the Grok CLI
- The preflight check blocked the PR
- The generated patch failed validation or `git apply --check`

## Layout

Code lives in `agent-scripts/ai-review/`, not under `scripts/`. The maintainer sweep stays in `scripts/maintainer/` and does not review diffs.
