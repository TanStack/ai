---
name: pr-description
description: Use when writing a pull request title or body, when about to run gh pr create, when about to git push on a branch that already has an open PR, or when the user says /pr-description, "write the PR description", or "update the PR title". Don't use for commit messages, changelogs, or review comments.
---

# pr-description

Write the GitHub PR title and body, then post them. Do not wait for approval.

Work from the diff, not from memory.

## When to run

This skill is auto plus on demand.

Run it:

- When the user asks for a PR title or body, or types `/pr-description`.
- Immediately before `gh pr create`.
- Immediately after an **agent** `git push` on a branch that already has an open PR. Then run `gh pr edit` with a fresh title and body.

Do not run it on a human-only `git push` in another terminal. Do not add a git hook.

A later push must rewrite the GitHub text. Do not leave a stale description.

A **fix** PR must pass `bugfix-pr` first. If those gates fail, stop. Do not run `gh pr create`. Do not run `gh pr edit`.

## Required skills for the title and body

`simple-english` and `i-have-adhd` are prerequisites. They apply to the PR title and body, not to the rest of the session.

Load both immediately before writing the title and body. Use the Skill tool if this harness has one. If it does not, Read:

- `.claude/skills/simple-english/SKILL.md`
- `.claude/skills/i-have-adhd/SKILL.md`

Copies also live at `.agents/skills/` (Codex) and `.grok/skills/` (Grok). Keep those three files identical.

If either file is missing, stop. Do not post a weaker substitute.

When `i-have-adhd` is loaded from this skill, ignore its persistence section. Do not switch the rest of the session into ADHD mode.

Use pragmatic `simple-english`. Then shape the text with `i-have-adhd`: next action first in the lead, numbered steps for manual test, lists capped at 5.

## Procedure

### 1. Ground in the repo

1. Find the base branch (`main` / `master` / `develop`).
2. Read `git log --oneline base...HEAD` and `git diff base...HEAD`.
3. Read `.github/pull_request_template.md` if it exists (also check `.github/PULL_REQUEST_TEMPLATE.md` and `.github/PULL_REQUEST_TEMPLATE/`).
4. Read about 15 recent PR titles in this repo (`gh pr list --limit 15 --state all --json title`). Match that shape. Do not invent a new title style.
5. Collect linked issues from branch name, commit messages, and `Closes #` / `Fixes #` text.

### 2. Classify the PR

Pick one kind from the diff:

| Kind             | Signal                                                                           |
| ---------------- | -------------------------------------------------------------------------------- |
| **fix**          | Restores broken behavior. A user-visible bug, a failing test, a regression.      |
| **feat**         | Adds behavior that did not exist. New export, new command, new user-facing flow. |
| **chore / docs** | Agent files, CI, docs-only, refactors with no user-visible behavior change.      |

If both a feat and a fix are in the diff, the larger user-visible story wins. Say so in the lead.

### 3. Feat gate: easy test path

<HARD-GATE>
A **feat** PR cannot be posted until the branch has at least one of:

- A new or updated automated test that covers the new behavior
- A command a reviewer can copy and run
- A change in an official example app that shows the new behavior

If none of those exist, stop. Do not run `gh pr create`. Do not run `gh pr edit`. Tell the user what is missing. Wait until they add one, then continue.

A **fix** does not use this gate. A **fix** uses `bugfix-pr`. Load it first.
A **chore / docs** PR does not use this gate.
</HARD-GATE>

### 4. Write the title

Match this repo's recent PR titles. In a conventional-commit repo, write `type(scope): summary`. Keep it one line.

The title must still make sense if the reviewer never opens the body.

### 5. Write the body

Load `simple-english` and `i-have-adhd`, then write in this order.

**Lead (required, 1 to 4 sentences, before the template).**

- **feat:** what the PR does for a user of the product.
- **fix:** what the bug is, then how this PR fixes it.
- **chore / docs:** what changed, in product or repo terms, not a file list.

No preamble. No "This PR aims to". Start with the fact.

**Repo template (required when the file exists).**

Fill every section honestly. Leave a checkbox unchecked when the claim is false. Do not tick "I ran `pnpm test:pr`" if you did not run it.

**Extra sections after the template, in this order.** Testing and Risk / rollback are always present. Linked issues and Public API change are omitted when they do not apply.

#### Testing

Three parts, all required:

1. **Commands run.** What you ran, what passed, what you skipped and why. If you ran nothing, say so.
2. **Manual test.** Numbered steps a reviewer can follow to see the change. For a **fix**, step 1 is how to reproduce the old bug, then how to confirm it is gone.
3. **How this PR makes testing easy.** Name the artifacts on the branch: tests, a command, an example app change. If there are none (allowed for fix and chore / docs), write that. Do not invent an easy path.

#### Linked issues

Omit this heading when nothing links. When an issue links, use `Closes #N` or `Fixes #N`.

#### Risk / rollback

What could break. How to undo (revert the PR, turn a flag off, and so on). If risk is low, say that in one line. Do not skip the heading.

#### Public API change

Omit this heading when the PR does not touch the published surface.

Published surface means: exported functions, types, components, CLI flags, env vars, and documented contracts from **published** packages. Tests, internal files, agent skills, `AGENTS.md`, and `CLAUDE.md` do not count.

When it does touch that surface, show **caller usage**, not the internal diff:

```markdown
## Public API change

**Before**

\`\`\`ts
old call site
\`\`\`

**After**

\`\`\`ts
new call site
\`\`\`
```

Two short snippets. What a user writes today, then what they write after this PR.

### 6. Post immediately

Do not wait for the user to approve the text.

- No PR yet: `gh pr create --title "..." --body-file ...`
- PR already open: `gh pr edit --title "..." --body-file ...`

If `gh` fails, stop and show the error. Leave the drafted body in the chat so it is not lost.

Do not attach screenshots to the PR. Do not commit screenshot files for this skill.

## Red flags

| You catch yourself                                     | Do instead                                          |
| ------------------------------------------------------ | --------------------------------------------------- |
| Writing the body from the branch name                  | Read the diff.                                      |
| Ticking a template checkbox you did not do             | Leave it unchecked and say so in Testing.           |
| Posting a feat with no test, command, or example       | Stop. The feat gate failed.                         |
| A 1-4 sentence lead that lists files                   | Rewrite as what a user can do, or what bug is gone. |
| Public API section that shows the internal diff        | Show caller usage before and after.                 |
| Public API section on an AGENTS.md-only PR             | Omit the heading.                                   |
| "I'll update the description later" after a push       | Rewrite now with `gh pr edit`.                      |
| Waiting for the user to approve the text               | Post. This skill does not wait.                     |
| Uploading or committing screenshots for the PR body    | Skip. Do not put images on the PR.                  |
| Writing without loading simple-english and i-have-adhd | Load both from the repo copies. If missing, stop.   |
| Posting a fix before `bugfix-pr` gates pass            | Stop. Load `bugfix-pr`. Do not create or edit.      |
