---
title: Undo a turn
id: harness-snapshots
order: 8
description: "Let the user undo the file changes of the last agent turn with /undo, bring them back with /redo, and show what each model step changed."
keywords:
  - tanstack ai
  - harness
  - coding agent
  - snapshots
  - undo
  - diff
---

The agent changed five files, and the result is wrong. You want the files back as they were before that turn, and you do not want a reset in your own git repository. `snapshots()` saves the files of the workspace at each model step, in a git repository of its own. `/undo` puts the files back and removes the turn from the conversation.

## 1. Add the plugin

```ts group=harness-snapshots
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { snapshots, workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { runCli } from '@tanstack/ai-harness-cli'
import { openaiText } from '@tanstack/ai-openai'

const root = process.cwd()
const history = snapshots({
  root,
  dataDir: join(homedir(), '.acme-coder', 'snapshots'),
})

const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [permissions({ root }), workspaceTools({ root }), history],
})

process.exitCode = await runCli(coder)
```

- `root` is the workspace folder, an absolute path.
- `dataDir` is a folder for the snapshot repositories, an absolute path. Put it outside `root`. Each workspace gets its own repository in it.
- The plugin needs the `git` command. `/undo` and `/redo` need git 2.26 or later.
- Your project does not need to be a git repository, and the plugin never uses the `.git` folder of your project.

## 2. Undo and redo a turn

1. Run `npx tsx coder.ts`, and ask for a change.
2. Run `/undo`. The CLI prints the number of files that it put back, for example `Undid the last turn. Files restored: 3.`
3. Look at the files that the turn changed: they are as they were before the turn. The turn is gone from the conversation too.
4. To bring back the files and the turn, run `/redo`. The CLI prints `Redid the last turn.`

- `/undo` puts back each file that the turn changed in `root`. This includes the edits of the file tools and the changes of `bash` commands.
- `/undo` and `/redo` do not touch other files. This is also true for a file that you add or edit after the turn.
- If you edit a file that the turn changed, `/undo` and `/redo` still write over it, and your edit is lost.
- The snapshots skip the files that `.gitignore` names, like `node_modules`. `/undo` does not touch them.
- A new turn clears `/redo`.

In your own UI, add `expose: { commands: ['undo', 'redo'] }` to `defineHarness`. A client can run only the commands that the harness exposes (see [Choose what clients can change](./connect#choose-what-clients-can-change)). Then call `client.command('undo')`. The result text arrives as a `harness.command.result` event.

## See what a step changed

Each model step that changed files leaves a step: `{ from, to, files, toolCallIds }`. `from` and `to` are the ids of two snapshots. `files` lists the changed paths, and `toolCallIds` lists the tool calls of the step. `history.diff(from, to)` gives the changed files and a unified diff.

On a [durable host](./durable-sessions), the steps are `tanstack/snapshots:step` records in the session log:

```ts group=harness-snapshots
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'

const log = memoryLogStore()
const host = createHarnessHost({
  persistence: { stores: { log, runs: memoryPersistence().stores.runs } },
})
const session = await host.open(coder, { threadId: 'fix-login' })
await session.prompt('Fix the login form.')

for (const { record } of await log.read('fix-login')) {
  if (record.type !== 'tanstack/snapshots:step') continue
  if (typeof record.from !== 'string' || typeof record.to !== 'string') continue
  const { files, patch } = await history.diff(record.from, record.to)
  console.log(files.join(', '))
  console.log(patch)
}
```

- Without `to`, `diff` compares with the files now. `history.diff(record.to)` shows what changed after that step.
- On a host without a log, the steps are a list in the plugin state, `snapshot().plugins['tanstack/snapshots']`.
- A step that changed no file is not saved.

## Go back to an earlier message

`/undo` goes back one turn. To go back more turns, revert the session to a message of the transcript:

```ts group=harness-snapshots
const messages = await session.transcript()
const firstAnswer = messages.find((message) => message.role === 'assistant')
if (firstAnswer?.id) await session.revert(firstAnswer.id)

// Bring back the files and the messages.
await session.unrevert()
```

- The files that the tool calls after that message changed go back, as with `/undo`. Other files stay as they are.
- `transcript()` hides the messages after that message until `unrevert()` or the next prompt.
- The next prompt drops the hidden messages for good. Then `unrevert()` does not change the files.
- The revert is saved, so `unrevert()` still works after a restart.

In your own UI, call `client.revert(messageId)` and `client.unrevert()`. The client needs `'undo'` in `expose.commands`. More about reverts: [Go back to an earlier message](./sessions#go-back-to-an-earlier-message).

## In a sandbox

When the [coding tools run in a sandbox](./coding-tools-backends#run-the-tools-in-a-sandbox), give `snapshots()` the same `backend`:

```ts group=harness-snapshots-sandbox
import { snapshots } from '@tanstack/ai-harness/plugins/coding'
import { sandboxWorkspaceBackend } from '@tanstack/ai-sandbox/harness'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = await dockerSandbox({ image: 'node:22' }).create({})

export const sandboxHistory = snapshots({
  root: '/workspace',
  dataDir: '/tmp/snapshots',
  backend: sandboxWorkspaceBackend(sandbox),
})
```

Git then runs in the sandbox, and `dataDir` is a path in the sandbox. The sandbox image needs `git`.

## Known limits

- One level of undo. A second `/undo` answers `Nothing to undo.` After a `/redo`, `/undo` works again.
- `/undo` and `/redo` work only when the session is idle. During a turn, they answer `Wait until the turn ends, then try again.`
- The undo point is kept in memory. After a restart, or when the session opens again, `/undo` works again after the next turn.
- If you sent a message while the turn ran, `/undo` removes the conversation from that message on. The files still go back to the start of the turn.
- Without `git`, the plugin prints `snapshots: git was not found. Snapshots are off.` once, and adds no commands. `diff()` throws. The turns run as usual.

## What you have now

- `/undo` and `/redo` for the file changes of the last turn, also the changes of shell commands.
- A revert to any earlier message, with its files, and `unrevert()` to bring them back.
- A list of changed files and a unified diff for each model step.
- Snapshots that never touch the git repository of your project.
