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
  - sandbox
  - permissions
  - formatter
---

Your agent must read and change the files of a project, search them, and run commands like `pnpm test`. It must stay in that project, and it must ask before it changes a file. `workspaceTools()` gives the model these tools for one folder. `permissions()` asks the user before each risky call.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-harness-cli @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-harness-cli @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-harness-cli @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-harness-cli @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-harness-cli @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-harness-cli @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-harness-cli @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-harness-cli @tanstack/ai-openai

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
import { defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { runCli } from '@tanstack/ai-harness-cli'
import { openaiText } from '@tanstack/ai-openai'

const root = process.cwd()

const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [permissions({ root }), workspaceTools({ root })],
})

process.exitCode = await runCli(coder)
```

`@tanstack/ai-harness/plugins/coding` runs only in Node. The tools use the file system and the shell of the machine. For code that you do not trust, [run the tools in a sandbox](./coding-tools-backends#run-the-tools-in-a-sandbox).

## 3. Run it

1. Run `npx tsx coder.ts` in your project.
2. Ask: `find the failing test and fix it`.
3. When the agent wants to change a file or run a command, answer the question in the CLI.

The agent reads and searches without a question. For a full terminal agent with a todo list and a model picker, see [Build a coding agent](./coding-agent).

## The tools

### Read and search

These tools run without a question.

| Tool | What it does |
| --- | --- |
| `read_file` | Reads a text file as numbered lines, at most 2000 lines or 50 KiB a page. The model reads more with `offset` and `limit`. |
| `list_files` | Lists the files in a folder. An optional glob, like `src/**/*.ts`, filters them. |
| `grep` | Searches the file contents with a regular expression. Gives `file:line: text`. |

- `read_file` gives images (PNG, JPEG, GIF, WebP) and PDFs up to 5 MB to the model as media.
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
- With `background: true`, the call returns at once with a job id. When the job ends, the model gets a note with the output, and a new turn starts.
- With `spillDir`, long output goes to a file in that folder, and the model gets the path. `spillDir` is relative to `root`, or absolute.
- When the session closes, the background jobs stop.

For `webfetch`:

- It reads `http` and `https` URLs only, and follows at most 5 redirects.
- It refuses `localhost`, private network addresses, and cloud metadata addresses. It checks the DNS answer of each connection.
- HTML comes back as Markdown, or as text without `turndown`. The model can ask for `format: 'html'`. Text and JSON come back as they are.
- It reads at most 5 MB. It stops after 30 seconds, and the model can ask for up to 120 seconds.

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
- `bash` splits a command at `&&`, `||`, `;`, `|`, and new lines. Every part must be allowed.
- A command with `$(`, a backtick, or a heredoc never gets an allow.

[Permissions](./permissions) explains the rules, the modes, and the saved answers.

## Outside paths and the working folder

### A path outside `root`

The tools refuse a path outside `root`. To ask the user instead, set `outside: 'ask'`:

```ts group=harness-coding-tools
export const askOutside = workspaceTools({ root, outside: 'ask' })
```

- A yes allows that folder, and the folders in it, until the session ends.
- `bypass` mode allows every path without a question.
- A link in `root` that leads out of `root` counts as outside.

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
await session.configure({ cwd: 'web-app' })
```

- Relative paths start in `/srv/repos/web-app`, and `bash` runs there.
- The system prompt tells the model the working folder.
- Permission rules still match paths from `root`, for example `web-app/src/**`.
- `cwd` is relative to `root`. A `cwd` outside `root` counts as an outside path.

[Store settings per thread](./thread-settings) shows how a client sets `cwd`.

## What you have now

- An agent that reads, searches, and changes the files of one folder, and runs commands in it.
- A question before each edit, command, and web fetch.
- A working folder for each thread, and a question before a path outside `root`.

Next: run the same tools in a sandbox, or format each file after a write. See [Sandbox and extend the coding tools](./coding-tools-backends).
