# Grok PR review bot

A GitHub Action that reviews open pull requests with TanStack AI (`chat()` + `grokBuildText('grok-4.6')`). It comments, sets one `ai-*` label, and can push listed polish commits.

The first lines of every bot comment say the comment is automated. It is not a maintainer review. The bot never GitHub-approves a review and never merges.

## What you need

1. A machine GitHub user with write access on this repo.
2. A PAT for that user, stored as repo secret `AI_REVIEW_TOKEN`. The PAT needs `repo` so it can comment, label, push polish commits, and approve waiting Actions runs.
3. An xAI key, stored as repo secret `XAI_API_KEY`. Use a key only for this bot, with a spend limit. See **Security boundary** for the reason.
4. Docker on the review runner.

The workflow reads the machine user's login from the PAT. `tanstack-ai-bot` is only the default for a local run.

Until both secrets exist, the job fails red. Every trigger runs in the TanStack repo with secrets, so a missing secret is a broken setup. The job does not run in a fork of this repo. It does not comment as `github-actions[bot]`.

## How a run starts

Two workflows split the job. `ai-review-signal` runs without secrets or a checkout. Its completion starts the trusted reviewer on `main`. The reviewer never trusts `workflow_run.pull_requests`, which is empty for a fork. It reads the run through the API, then lists open PRs into `main` for the run's head owner and branch. It needs exactly one PR that matches the head repository, branch, and SHA. It rejects stale, mismatched, or ambiguous results.

Auto: the signal fires on opened, synchronize, and ready_for_review for PRs that target `main`. Auto skips drafts, bot PRs, roster-maintainer PRs, the machine user's own head commit, and a head SHA this bot already reviewed. The host never executes PR code. Grok can execute it inside the container.

Manual: a roster maintainer writes `/ai-review` on the PR. Anyone with write access can also use Actions `workflow_dispatch` on `main`. These requests bypass automatic draft, author, and reviewed-SHA skips. The workflow `if` hardcodes the same logins as `.github/maintainers.json`. Update both.

No label starts a review. The workflow does not use `pull_request_target`.

GitHub holds the signal run of a first-time fork contributor for approval, so no automatic review starts. Write `/ai-review` on that PR. The bot scans first. It approves the waiting runs only after a clean `ai-ready` result. Do not click **Approve and run workflows** first. That also starts the review, but it releases the Test checks on PR code that no one scanned. This assumes the repo setting "Require approval for first-time contributors".

## Security boundary

Before a new audit, the host removes stale `secure` and `ai-ready` labels. An automatic run for a draft also removes these labels, even when its SHA is unchanged. It fetches fixed base and head commits without a checkout. It reads the complete diff from their merge base. The security check and Grok receive the same snapshot. Renames appear as deletions and additions, so both paths are checked. It checks the PR before it starts Grok. The check fails closed when it finds:

- An incomplete Git snapshot or Git output above 10 MB
- A symlink, submodule, file type change, or a file that is or becomes executable
- A binary file
- A changed workflow, agent instruction, hook, action, or release script
- A new dependency in a `package.json` file
- A lockfile change
- A shell download, encoded PowerShell command, or reverse shell

Grok clones the exact PR commit into a disposable Docker container. The container does not receive `AI_REVIEW_TOKEN`, mount host files, or get a `host.docker.internal` alias. It receives `XAI_API_KEY` and has network access because Grok needs the xAI API. The Docker provider cannot restrict network destinations. Grok CLI child commands can read `XAI_API_KEY`. PR code or model commands can expose it through network access. Docker, prompt rules, the host scanner, and `hostGateway: false` do not protect this key. The GitHub token stays outside the container. The key can also leak through the job log. The host blocks a generated patch or review text that holds the exact key, but it cannot see a changed form of the key. This xAI key risk remains in this design, so use a key only for this bot, with a spend limit.

A blocked PR gets a bot comment with the head SHA and the reasons. A draft or a roster-maintainer PR that automatic review skips gets no comment. It gets no verdict label, and the job stays green. A failed `git fetch` is not a block. It fails the job red.

A pull request can stop its own next review. The signal runs the PR's copy of `ai-review-signal.yml`, so a later commit can delete or break it. Then no review runs, and `secure` and `ai-ready` stay on a head that no one reviewed. Check that the **Head SHA** in the bot comment matches the PR head before you trust either label.

Every trigger of the reviewer runs in the default-branch cache scope, and the agent reads text that a fork controls. Docker keeps agent commands away from the runner's cache token. Do not add `pull_request_target`, a cache step, or `id-token: write` to this workflow. Do not run the agent outside Docker. See the [npm supply-chain postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem).

Grok edits only its container clone. The host receives a unified diff after the review. Before the host applies that diff, it rejects large or malformed patches, sensitive files, package files, lockfiles, symlinks, binaries, path traversal, and the exact sandbox secret. Each file needs its own matching headers and complete hunks. The host then runs `git apply --check` before it applies, commits, or pushes the patch.

Before it publishes a verdict, the host checks the PR number, open state, base SHA and repository, and head SHA, repository, and branch. The base must still be `main`. After a polish push, the expected SHA is the new commit. GitHub can still report the old head just after that push, so the host accepts that one read. A changed head receives no verdict from the old review.

## Labels

The bot does not auto-approve workflows when the PR changes a workflow file.

The bot sets exactly one of these verdict labels. It removes the other two. It never touches `ready-to-merge`.

When the verdict is `ai-ready` and the host scan is clean, the bot approves waiting first-time-contributor workflow runs. If that approval succeeds, it adds `secure`. After a `/ai-review` run, a maintainer can Approve and merge without clicking **Approve and run workflows** first.

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

- Missing `AI_REVIEW_TOKEN` or `XAI_API_KEY` (the job fails red)
- `git fetch` of the base or head commit failed
- Fork with maintainer edits off (comment is posted, label is `ai-needs-work`, no push)
- `chat()` did not return a valid verdict object
- Workspace setup failed to install the Grok CLI
- The generated patch failed `git apply --check`

A blocked PR is not a failed run. The job is green, and the bot comment lists the reasons.

## Layout

Code lives in `agent-scripts/ai-review/`, not under `scripts/`. The maintainer sweep stays in `scripts/maintainer/` and does not review diffs.
