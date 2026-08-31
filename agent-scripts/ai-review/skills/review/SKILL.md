---
name: review
description: Review a pull request diff. List bugs, suggestions, and nits. Decide reject, polish, or ready.
---

# Review

Review a pull request from the title, body, linked issue, and diff.

## Read

1. Read the PR title and body.
2. If a linked issue exists, read that issue.
3. Read the full diff.

Correctness is first. Style is second.

Find edge cases, error-handling gaps, and race conditions.
Trace cross-module side effects of simple changes.

## List issues

List each issue with severity, file, line, description, and suggestion.

Set severity to `bug`, `suggestion`, or `nit`.

A bug is a correctness, security, or breakage defect.
Do not mark a style preference as a bug.
A suggestion is a useful fix that is not a bug.
A nit is style only.

If the diff is fine, list no issues.
Do not invent issues to fill space.

## Usefulness

Decide whether the change is useful.

If the change is the wrong fix, it is not useful.
If the change is not needed, it is not useful.

## Verdict

Call `emit_verdict` with `reject`, `polish`, or `ready`.

If the change is not useful, call `emit_verdict` with `reject`.
If the verdict is `reject`, do not edit files.

If the change is useful and the list has bugs or suggestions, call `emit_verdict` with `polish`.
If the verdict is `polish`, edit only those listed bugs and suggestions.
Do not commit nits.
Do not add extra refactors.
If the list names a missing changeset, add a changeset.
If the list names a missing E2E test, add that test.

If the change is useful and clean, call `emit_verdict` with `ready`.
If the verdict is `ready`, do not edit files.

If you edited files, call `emit_verdict` again.

Never GitHub-approve.
Never merge.
Never run shell.
Never run `pnpm install`.
Never edit `.github/workflows`.
