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
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { snapshots, workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'

const root = process.cwd()
const dataDir = join(homedir(), '.acme-coder', 'snapshots')
const history = snapshots({ root, dataDir })

const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [permissions({ root }), workspaceTools({ root }), history],
})

const persistence = memoryPersistence()
const { log } = persistence.stores
const host = createHarnessHost({ persistence })
const session = await host.open(coder, { threadId: 'fix-login' })
```

- `root` is the workspace folder, an absolute path.
- `dataDir` is a folder for the snapshot repositories, an absolute path. Put it outside `root`. Each thread of each tenant gets its own repository in it.
- The plugin needs the `git` command. `/undo` and `/redo` need git 2.26 or later.
- Your project does not need to be a git repository, and the plugin never uses the `.git` folder of your project.
- With [`workspaceTools({ workspace: { bind } })`](./coding-workspaces) before it, each thread keeps its snapshots in its own workspace. Leave out `root`.

## 2. Undo and redo a turn

1. Send a prompt that changes files: `await session.send('Fix the login form.')`.
2. Run `await session.runCommand({ name: 'undo' })`. It returns the number of files that it put back, for example `Undid the last turn. Files restored: 3.`
3. Look at the files that the turn changed: they are as they were before the turn. The turn is gone from the conversation too.
4. To bring back the files and the turn, run `await session.runCommand({ name: 'redo' })`. It returns `Redid the last turn.`

In a terminal app, the user types `/undo` and `/redo`. See [Build a coding agent](./coding-agent).

- `/undo` puts back each file that the turn changed in `root`. This includes the edits of the file tools and the changes of `bash` commands.
- `/undo` and `/redo` do not touch other files. This is also true for a file that you add or edit after the turn.
- The snapshots skip the files that `.gitignore` names, like `node_modules`, and `.env` files. `/undo` does not touch them.
- A new turn clears `/redo`.

When someone else edits the same files:

- If you edit a file that the turn changed, `/undo` and `/redo` still write over it, and your edit is lost.
- A step keeps only the files that its own run changed. So when another agent or session edits a file during the turn, `/undo` keeps that edit.
- A `bash` command does not tell which files it changed. So its step keeps every file that changed while the command ran.

In your own UI, add `expose: { commands: ['undo', 'redo'] }` to `defineHarness`. A client can run only the commands that the harness exposes. Then call `client.runCommand({ name: 'undo' })`. The result text arrives as a `harness.command.result` event.

## See what a step changed

Each model step that changed files leaves a step: `{ from, to, files, toolCallIds }`. `from` and `to` are the ids of two snapshots. `files` lists the changed paths, and `toolCallIds` lists the tool calls of the step. `history.diff(from, to)` gives the changed files and a unified diff.

The steps are `tanstack/snapshots:step` records in the [session log](./session-log):

```ts group=harness-snapshots
import { logIdOf } from '@tanstack/ai-harness'

await session.send('Fix the login form.')

for (const { record } of await log.read({ logId: logIdOf({ logId: 'fix-login' }) })) {
  if (record.type !== 'tanstack/snapshots:step') continue
  if (typeof record.from !== 'string' || typeof record.to !== 'string') continue
  const { files, patch } = await history.diff(record.from, record.to)
  console.log(files.join(', '))
  console.log(patch)
}
```

- Without `to`, `diff` compares with the files now. `history.diff(record.to)` shows what changed after that step.
- `diff` finds a snapshot only in the repository of a session that is open.
- A step that changed no file is not saved.

## Go back to an earlier message

`/undo` goes back one turn. To go back more turns, revert the session to a message of the transcript:

```ts group=harness-snapshots
const messages = await session.transcript()
const firstAnswer = messages.find((message) => message.role === 'assistant')
if (firstAnswer?.id) await session.revert({ messageId: firstAnswer.id })

// Bring back the files and the messages.
await session.unrevert()
```

- A revert uses the last 500 steps of the thread. The log snapshot keeps them, so a revert also works with [`keepLogRecords: 'since-snapshot'`](./lifecycle#drop-the-records-before-a-snapshot).
- A revert touches only the files that the tool calls after that message changed. Each file goes back to its state before the first of these calls. A file that did not exist then is removed.
- Other files stay as they are. Your own edits between the hidden turns stay too.
- `unrevert()` touches only the same files. It puts them back as they were when the revert started, with your edits.
- A prompt that you send during `revert()` or `unrevert()` waits until it ends. Then the turn runs.
- `transcript()` hides the messages after that message until `unrevert()` or the next prompt.
- The next prompt drops the hidden messages for good. Then `unrevert()` does not change the files.
- The revert is saved, so `unrevert()` still works after a restart.

In your own UI, call `client.revert({ messageId })` and `client.unrevert()`. The client needs `'undo'` in `expose.commands`. More about reverts: [Go back to an earlier message](./sessions#go-back-to-an-earlier-message).

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

## On more than one server

The undo point and the steps are in the session log. So when another server takes the thread, `/undo`, `/redo`, and a revert work there too, if that server reaches the same snapshot repository:

- In a sandbox, the repository is in the sandbox. A server that uses the same sandbox reaches it. See [A sandbox](./coding-workspaces#a-sandbox).
- On the host, give every server the same `dataDir` on a shared disk. Or pin each thread to the server that has its folder with `ownership: { hostId }`. See [A folder on one server](./coding-workspaces#a-folder-on-one-server).

## Remove the snapshots of a thread

[`host.sessions.delete`](./lifecycle#delete-a-thread-for-good) removes the snapshot repository of the thread for you. This needs two things:

- The thread has an index entry.
- This host knows the harness: it opened a session of it before, or it has the harness in its [`harnesses`](./lifecycle#delete-a-thread-for-good) option.

In other cases, call `purgeSnapshots` with the options of the plugin and the thread:

```ts group=harness-snapshots
import { purgeSnapshots } from '@tanstack/ai-harness/plugins/coding'

await purgeSnapshots({ root, dataDir }, { tenantId: 'acme', threadId: 'fix-login' })
```

- Call it after the sessions of the thread close. See [Lifecycle and retention](./lifecycle).
- Leave out `tenantId` for a thread in the default tenant.
- It waits for the git commands of that repository in this process.
- It resolves also when there is no repository.

## Known limits

- One level of undo. A second `/undo` answers `Nothing to undo.` After a `/redo`, `/undo` works again.
- `/undo` and `/redo` work only when the session is idle. During a turn, they answer `Wait until the turn ends, then try again.`
- While a revert stands, `/undo` and `/redo` answer `A revert stands. Run unrevert, or send a prompt, first.`
- If you sent a message while the turn ran, `/undo` removes the conversation from that message on. The files still go back to the start of the turn.
- Without `git`, the plugin sends a `tanstack/snapshots:failed` event (`SnapshotFailed`) with `snapshots: git was not found. Snapshots are off.`, and adds no commands. `diff()` throws. The turns run as usual. A snapshot that fails for another reason sends the same event, and the turn goes on.

## What you have now

- `/undo` and `/redo` for the file changes of the last turn, also the changes of shell commands.
- A revert to any earlier message, with its files, and `unrevert()` to bring them back.
- A list of changed files and a unified diff for each model step.
- Snapshots that never touch the git repository of your project.
