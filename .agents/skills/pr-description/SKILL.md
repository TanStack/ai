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

## Required skills for the title and body

`simple-english` and `i-have-adhd` are prerequisites. They apply to the PR title and body, not to the rest of the session.

Load both immediately before writing the title and body. Use the Skill tool if this harness has one. If it does not, Read each skill's SKILL.md. Do not write from memory of those skills.

If either skill is missing, stop. Do not post a weaker substitute.

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

| Kind | Signal |
|---|---|
| **fix** | Restores broken behavior. A user-visible bug, a failing test, a regression. |
| **feat** | Adds behavior that did not exist. New export, new command, new user-facing flow. |
| **chore / docs** | Agent files, CI, docs-only, refactors with no user-visible behavior change. |

If both a feat and a fix are in the diff, the larger user-visible story wins. Say so in the lead.

### 3. Feat gate: easy test path

<HARD-GATE>
A **feat** PR cannot be posted until the branch has at least one of:

- A new or updated automated test that covers the new behavior
- A command a reviewer can copy and run
- A change in an official example app that shows the new behavior

If none of those exist, stop. Do not run `gh pr create`. Do not run `gh pr edit`. Tell the user what is missing. Wait until they add one, then continue.

A **fix** does not use this gate. A **chore / docs** PR does not use this gate.

Screenshots are not this gate. A screenshot does not replace a test, a command, or an example.
</HARD-GATE>

### 4. Screenshots (try, when the PR has UI)

This step is a try, not a gate. If capture fails, still write and post the PR.

The PR **has UI** when the diff changes something a person sees in a browser:

- Example apps
- Playground
- Docs site chrome (layout, theme, nav)
- CSS, or components that paint a screen (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html` that is not a test)

The PR **does not have UI** when the diff is only adapters, types, CI, tests, or agent files.

If you are not sure, treat it as UI and try.

Skip this step only when there is no UI, or the user said to skip screenshots. If there is no UI, omit the Screenshots heading later.

**Capture**

1. Find a runnable surface (example `pnpm dev`, a preview URL).
2. Open it with the browser tools this harness has (Playwright MCP, agent-browser, or the same).
3. Do the user flow this PR changes.
4. Save PNG screenshots of the result.
5. If layout or styling changed, save desktop and mobile (about 390px wide).
6. Cap at 4 images.
7. Stop the preview server after the files are saved. Do not leave a watcher running.

Do not invent UI with an image model. Real browser only.

**Put the images on the PR**

GitHub has no public upload API for `user-attachments` images. Commit the PNGs on the branch so the PR body can link to them.

1. Write files under `.github/pr-screenshots/<branch-kebab>/`.
2. Commit only those PNG files. Push.
3. Embed with full GitHub URLs. Relative paths do not render in a PR body.

```markdown
## Screenshots

Desktop

![desktop](https://github.com/OWNER/REPO/blob/BRANCH/.github/pr-screenshots/name/desktop.png?raw=true)
```

Get `OWNER/REPO` from `gh repo view --json nameWithOwner`. Use the branch name in the URL.

If the user already pasted `https://github.com/user-attachments/assets/...` links, use those. Do not also commit files.

If capture fails, still post. Keep the Screenshots heading and write one sentence: what you tried, and why it failed.

Do not wait for the user to paste images.
Do not refuse the PR because screenshots failed.

### 5. Write the title

Match this repo's recent PR titles. In a conventional-commit repo, write `type(scope): summary`. Keep it one line.

The title must still make sense if the reviewer never opens the body.

### 6. Write the body

Load `simple-english` and `i-have-adhd`, then write in this order.

**Lead (required, 1 to 4 sentences, before the template).**

- **feat:** what the PR does for a user of the product.
- **fix:** what the bug is, then how this PR fixes it.
- **chore / docs:** what changed, in product or repo terms, not a file list.

No preamble. No "This PR aims to". Start with the fact.

**Repo template (required when the file exists).**

Fill every section honestly. Leave a checkbox unchecked when the claim is false. Do not tick "I ran `pnpm test:pr`" if you did not run it.

**Extra sections after the template, in this order.** Testing and Risk / rollback are always present. Screenshots, Linked issues, and Public API change are omitted when they do not apply.

#### Testing

Three parts, all required:

1. **Commands run.** What you ran, what passed, what you skipped and why. If you ran nothing, say so.
2. **Manual test.** Numbered steps a reviewer can follow to see the change. For a **fix**, step 1 is how to reproduce the old bug, then how to confirm it is gone.
3. **How this PR makes testing easy.** Name the artifacts on the branch: tests, a command, an example app change. If there are none (allowed for fix and chore / docs), write that. Do not invent an easy path.

#### Screenshots

Required when step 4 ran (the PR has UI). Omit this heading when there is no UI.

- On success: the markdown images from step 4, each with a short caption (Desktop, Mobile, Before, After).
- On failure: one sentence. What you tried, and why it failed.

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

### 7. Post immediately

Do not wait for the user to approve the text.

- No PR yet: `gh pr create --title "..." --body-file ...`
- PR already open: `gh pr edit --title "..." --body-file ...`

If `gh` fails, stop and show the error. Leave the drafted body in the chat so it is not lost.

If step 4 wrote PNG files, those commits must be on the remote before the body links will render. Push first, then post or edit.

## Red flags

| You catch yourself | Do instead |
|---|---|
| Writing the body from the branch name | Read the diff. |
| Ticking a template checkbox you did not do | Leave it unchecked and say so in Testing. |
| Posting a feat with no test, command, or example | Stop. The feat gate failed. |
| A 1-4 sentence lead that lists files | Rewrite as what a user can do, or what bug is gone. |
| Public API section that shows the internal diff | Show caller usage before and after. |
| Public API section on an AGENTS.md-only PR | Omit the heading. |
| "I'll update the description later" after a push | Rewrite now with `gh pr edit`. |
| Waiting for the user to approve the text | Post. This skill does not wait. |
| Skipping screenshots on a UI PR because "the text is enough" | Try capture. |
| Skipping because GitHub has no upload API | Commit PNGs on the branch. Use `blob/...png?raw=true` URLs. |
| Relative image paths in the PR body | Use full `https://github.com/OWNER/REPO/blob/BRANCH/...png?raw=true` URLs. |
| Inventing a UI image with an image model | Real browser only. |
| Waiting for the user to paste images | Capture first. Post even if capture fails. |
| Refusing to post because screenshots failed | Post. Say why in Screenshots. |
| Using a screenshot as the feat-gate artifact | The feat gate still needs a test, a command, or an example. |
| Mixing unrelated files into the screenshot commit | Add only the PNG files. |
| Leaving a preview server running after capture | Stop the server. |
| Writing without loading simple-english and i-have-adhd | Load both. If missing, stop. |
