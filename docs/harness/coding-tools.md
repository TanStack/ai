---
title: Give your agent coding tools
id: harness-coding-tools
order: 6
description: "Let a harness agent read, change, and search files, run commands, and read web pages, with a question before each risky call."
keywords:
  - tanstack ai
  - harness
  - coding agent
  - workspace tools
  - permissions
  - formatter
---

Your agent must read and change the files of a project, search them, and run commands like `pnpm test`. It must stay in that project, and it must ask before it changes a file. `workspaceTools()` gives the model these tools for one folder. `permissions()` asks the user before each risky call.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-openai

<!-- ::end:tabs -->

Two optional packages make the tools better:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @vscode/ripgrep turndown
vue: @vscode/ripgrep turndown
solid: @vscode/ripgrep turndown
svelte: @vscode/ripgrep turndown
preact: @vscode/ripgrep turndown
angular: @vscode/ripgrep turndown
octane: @vscode/ripgrep turndown
vanilla: @vscode/ripgrep turndown

<!-- ::end:tabs -->

- `@vscode/ripgrep`: a fast `rg` binary for `list_files` and `grep`. Without it, the tools use `rg` on the `PATH`. Without `rg`, they use `git ls-files`, then a walk through the folders.
- `turndown`: `webfetch` gives HTML pages as Markdown. Without it, HTML pages come back as plain text.

## 2. Add the tools

```ts group=harness-coding-tools
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import type { RunAgentResumeItem } from '@tanstack/ai'
import { permissions } from '@tanstack/ai-harness/plugins'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'

const root = process.cwd()

const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [permissions({ root }), workspaceTools({ root })],
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(coder, { threadId: 'main' })
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
})

// Print the text of every turn, also of a turn that continues after an answer.
const stopPrinting = session.onEvent('TEXT_MESSAGE_CONTENT', ({ event }) => {
  process.stdout.write(event.delta)
})

// A risky call stops the turn before it runs. Ask about each approval of
// the turn, then send all the answers in one resolve.
async function answerApprovals() {
  let waits = session.snapshot().pendingWaits
  while (waits.length > 0) {
    const resume: Array<RunAgentResumeItem> = []
    for (const wait of waits) {
      const answer = await terminal.question(`\n${wait.message ?? wait.kind} (once/always/reject) `)
      resume.push({ interruptId: wait.waitId, status: 'resolved', payload: answer })
    }
    const inputId = randomUUID()
    await session.resolve({ resume, inputId })
    await session.settled({ inputId })
    waits = session.snapshot().pendingWaits
  }
}

// Send each line as a prompt. Type `exit` to stop.
let line = await terminal.question('\n> ')
while (line !== 'exit') {
  try {
    await session.send(line)
    await answerApprovals()
  } catch (error) {
    // A failed turn rejects. Show the error and keep the loop.
    console.error(error)
  }
  line = await terminal.question('\n> ')
}
stopPrinting()
terminal.close()
await host.close()
```

`@tanstack/ai-harness/plugins/coding` runs only in Node. The tools use the file system and the shell of the machine. For code that you do not trust, [run the tools in a sandbox](./coding-tools-backends#run-the-tools-in-a-sandbox).

## 3. Run it

1. Run `npx tsx coder.ts` in your project.
2. Ask: `find the failing test and fix it`.
3. When the agent wants to change a file or run a command, the turn stops, and the script asks in the terminal. Answer `once`, `always`, or `reject`.

The agent reads and searches without a question. For a full coding agent with undo, a todo list, and a model picker, see [Build a coding agent](./coding-agent).

## The tools

### Read and search

These tools run without a question.

| Tool | What it does |
| --- | --- |
| `read_file` | Reads a text file as numbered lines, at most 2000 lines or 50 KiB a page. The model reads more with `offset` and `limit`. |
| `list_files` | Lists the files in a folder. An optional glob, like `src/**/*.ts`, filters them. |
| `grep` | Searches the file contents with a regular expression. Gives `file:line: text`. |

- `read_file` gives images (PNG, JPEG, GIF, WebP) and PDFs up to 256 KB to the model as media. For a bigger file, the model gets an error that tells it to make a smaller copy.
- `read_file` refuses a binary file with a short note. For a missing file, it names up to 3 files with a close name.
- `list_files` and `grep` skip the files that `.gitignore` names, the `.git` and `node_modules` folders, and links.
- `list_files` shows at most 1000 files. `grep` shows at most 200 matches.

### Change files

These tools ask first.

| Tool | What it does |
| --- | --- |
| `write_file` | Creates or replaces a file. |
| `edit_file` | Replaces text in a file. The old text must be in the file once, unless the model sets `replaceAll`. |
| `patch` | Applies a patch that adds, deletes, updates, or moves files. |

A model gets `edit_file` or `patch`, not both. Every model gets `write_file`. The `editStyle` option picks the edit tool:

- `'auto'` (default): GPT models (ids that start with `gpt-`, or `o` and a digit, like `o3`) get `patch`. Other models get `edit_file`.
- `'edit'` or `'patch'`: every model gets that tool.

`edit_file` keeps the line endings and the byte order mark of the file. It also finds text that is different only in Unicode form or in the spaces at the end of a line.

When a file changed after the model read it, for example by another agent, the three tools fail. The model reads the file again, then edits it.

To let the user undo the changes of a turn, add [snapshots](./snapshots).

### Commands and the web

| Tool | What it does | Asks first |
| --- | --- | --- |
| `bash` | Runs a shell command in the working folder. | Yes |
| `webfetch` | Reads a web page by its URL. | Yes |
| `websearch` | Searches the web. It is there only with a search provider. | No |

For `bash`:

- The model gets the exit code and the last 1000 lines (20 KiB) of the output.
- A command stops after 2 minutes, with exit code 124. Every process that it started stops too. Set another limit with `bashTimeoutMs`. The model can ask for up to 10 minutes.
- With `spillDir`, long output goes to a file in that folder, and the model gets the path. `spillDir` is relative to `root`, or absolute. The file has `[redacted]` in place of each secret of the session, the same as the tool result. See [Keep tokens out of the log and the model](./auth#keep-tokens-out-of-the-log-and-the-model).
- A command gets only a few variables of your process, like `PATH` and `HOME`. Your provider keys are not in its env. On the host this is not isolation: a command can still read the files of your server. See [Keep server secrets out of commands](./coding-workspaces#2-keep-server-secrets-out-of-commands).

With `background: true`, the call returns at once with a job id. When the job ends, the model gets a note with the output, and a new turn starts. That turn runs as the user whose run started the job.

- The time limit does not apply to a background job.
- At most 8 background jobs run at a time in a session. Set another limit with `maxJobs`. Each job keeps the newest 1 MiB of its output.
- When the session closes, the background jobs stop.
- The log keeps each background job until it ends. When a crash stops a job, the next host adds the note "Background job bash-1 stopped when the host restarted."

On Windows, the default backend runs commands in `cmd.exe`. A program name like `rg` or `gradlew` comes from the `PATH` only, not from the working folder. So a cloned repo cannot put its own `rg.cmd` in place of `rg`. To run a script in the working folder, give its path: `.\gradlew build`.

For `webfetch`:

- It reads `http` and `https` URLs only, and follows at most 5 redirects.
- It refuses `localhost`, private network addresses, and cloud metadata addresses. It checks the DNS answer of each connection.
- HTML comes back as Markdown, or as text without `turndown`. The model can ask for `format: 'html'`. Text and JSON come back as they are.
- The model gets the first 256 KB of a page, with a note when there is more. It reads at most 5 MB.
- It stops after 30 seconds, and the model can ask for up to 120 seconds.

Change the web tools with the `web` option:

- `web: false`: no web tools.
- `web: { allowPrivateHosts: true }`: `webfetch` can read `localhost` and your private network. Set it only for a model that is allowed to reach your network.
- `web: { search }`: adds `websearch`.

There is no built-in search engine. Give `websearch` a `SearchProvider`:

```ts group=harness-coding-tools
import type { SearchProvider } from '@tanstack/ai-harness/plugins/coding'
import { searchTheWeb } from './search'

const search: SearchProvider = {
  search: (query, { limit, signal }) => searchTheWeb(query, { limit, signal }),
}

export const withSearch = workspaceTools({ root, web: { search } })
```

The provider gives at most `limit` results. Each result is `{ title, url, snippet? }`. The model reads a result with `webfetch`.

## Permissions and approvals

Each tool tells `permissions()` what kind of call it makes:

| Tools | `default` mode | `plan` mode |
| --- | --- | --- |
| `read_file`, `list_files`, `grep`, `websearch` | Runs | Runs |
| `write_file`, `edit_file`, `patch` | Asks | Denied |
| `bash` | Asks | Denied |
| `webfetch` | Asks | Denied |

- `acceptEdits` mode runs the edits without a question. `bash` still asks.
- `bypass` mode runs every call.
- `read_file` asks for a `.env` file.
- `grep` skips each file that `read_file` asks about or denies, also in `plan` mode. A note at the end gives the number of skipped files.
- `list_files` still shows the names of these files. A name is not the contents.

Let `webfetch` run without a question with one rule:

```ts group=harness-coding-tools
export const trustTheWeb = permissions({
  root,
  rules: [{ tool: 'webfetch', decision: 'allow' }],
})
```

In `plan` mode, a call that asks is denied. This rule makes `webfetch` an allow, so `webfetch` runs in `plan` mode too.

Each call also tells `permissions()` the paths or the commands that it touches. So a rule with a `resource` can allow one folder or one command:

```ts group=harness-coding-tools
export const trustTests = permissions({
  root,
  rules: [
    { tool: 'edit_file', resource: 'src/**', decision: 'allow' },
    { tool: 'bash', resource: 'pnpm test*', decision: 'allow' },
  ],
})
```

- Paths match from `root`. Give `permissions()` and `workspaceTools()` the same `root`.
- A rule also matches the real path of a link, and the stricter decision wins. So a link `notes` to `.env` asks, and a `deny` for `secrets/**` also stops a link to `secrets`.
- The rules decide every path before the call runs. A tool never asks while it runs.
- `bash` splits a command at `&&`, `||`, `;`, `|`, and new lines. Every part must be allowed.
- A command with `$(`, a backtick, or a heredoc never gets an allow.

[Permissions](./permissions) explains the rules, the modes, and the saved answers.

## Outside paths and the working folder

### A path outside `root`

The tools refuse a path outside `root`. To let the user approve it, set `outside: 'ask'`:

```ts group=harness-coding-tools
export const askOutside = workspaceTools({ root, outside: 'ask' })
```

`permissions()` decides the outside path before the call runs. The path is a part of the one [approval](./permissions#answer-an-approval) of the call: the turn stops, and you answer with `resolve`. The tool never stops in the middle of a call to ask.

- `once` allows this call. `always` also saves an allow rule for the path.
- `reject` stops the call. The call does not run, so nothing is read or written.
- A link in `root` that leads out of `root` counts as outside. The rules decide its real path.
- `bypass` mode allows every path without a question. Without `permissions()`, nobody can approve the path, so the tool refuses it.
- With `permissions()`, `grep` skips the files outside `root`, because `read_file` asks for them. A `read_file` rule for that folder, for example `{ tool: 'read_file', resource: '/shared/**', decision: 'allow' }`, lets `grep` show them.

With a [workspace for each thread](./coding-workspaces), the root is not known before the call, so no approval can cover an outside path. Then only a rule that allows the path, or `bypass` mode, lets the call use it.

### A working folder for each thread

Each thread can work in its own folder in `root`. Set the `cwd` thread setting:

```ts group=harness-coding-tools-cwd
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

const repos = defineHarness({
  name: 'acme/repos',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [workspaceTools({ root: '/srv/repos' })],
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(repos, { threadId: 'fix-login' })
await session.updateThreadSettings({ settings: { cwd: 'web-app' } })
```

- Relative paths start in `/srv/repos/web-app`, and `bash` runs there.
- The system prompt tells the model the working folder.
- Permission rules still match paths from `root`, for example `web-app/src/**`.
- `cwd` is relative to `root`. The tools refuse a `cwd` outside `root`, also with `outside: 'ask'`.

[Store settings per thread](./thread-settings) shows how a client sets `cwd`.

## What you have now

- An agent that reads, searches, and changes the files of one folder, and runs commands in it.
- A question before each edit, command, and web fetch.
- A working folder for each thread, and a question before a path outside `root`.

Next: run the same tools in a sandbox, or format each file after a write. See [Sandbox and extend the coding tools](./coding-tools-backends). To give each thread its own folder on a server, see [Run the coding tools for many threads](./coding-workspaces).
