---
title: Sandbox and extend the coding tools
id: harness-coding-tools-backends
order: 7
description: "Run the coding tools in a sandbox or on your own backend, format each written file, and keep tool output small."
keywords:
  - tanstack ai
  - harness
  - coding agent
  - workspace tools
  - sandbox
  - formatter
  - workspace hooks
---

Your agent must work on files that are not on this machine, or on code that you do not trust. Or you want code to run after each write, like a formatter. The [coding tools](./coding-tools) send every read, write, and command through a backend, and they run hooks after each read and write. This page shows how to change both.

## Run the tools in a sandbox

By default, the tools run on your machine, with the rights of your user. For code that you do not trust, run them in a sandbox. `sandboxWorkspaceBackend()` sends every read, write, and command to the sandbox.

1. Install the sandbox packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vue: @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
solid: @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
svelte: @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
preact: @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
angular: @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
octane: @tanstack/ai-sandbox @tanstack/ai-sandbox-docker
vanilla: @tanstack/ai-sandbox @tanstack/ai-sandbox-docker

<!-- ::end:tabs -->

2. Start a sandbox, and give its backend to `workspaceTools()`:

```ts group=harness-coding-tools-sandbox
import { defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { openaiText } from '@tanstack/ai-openai'
import { sandboxWorkspaceBackend } from '@tanstack/ai-sandbox/harness'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = await dockerSandbox({ image: 'node:22' }).create({})
// Without `dir`, the clone goes to the workspace root, /workspace.
await sandbox.git.clone({ url: 'https://github.com/acme/web-app.git' })

const root = '/workspace'

export const sandboxed = defineHarness({
  name: 'acme/sandboxed-coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    permissions({ root }),
    workspaceTools({ root, backend: sandboxWorkspaceBackend(sandbox) }),
  ],
})
```

3. When you are done, stop the sandbox with `await sandbox.destroy()`.

Every provider works. Get the handle from `create()`, or from `resume()` for a sandbox that runs already. See [Providers](../sandbox/providers).

In a sandbox, some things are different:

- Paths are POSIX paths in the sandbox, like `/workspace/src/a.ts`, also on a Windows host.
- The tools do not check where links lead. The sandbox backend has no `realpath`.
- `background: true` needs a sandbox with `capabilities.backgroundProcesses`.
- A sandbox with `capabilities.killableProcesses` off cannot stop a command after the time limit. The call returns, and the command continues in the sandbox.
- `list_files` and `grep` use `rg` in the sandbox. The `@vscode/ripgrep` binary is a host file, so the sandbox does not use it.

## Write your own backend

A `WorkspaceBackend` is where the tools read and write files and run commands. Write one for another place, for example a remote machine. Every path that the tools give it is absolute.

The backend must have:

| Method | What it does |
| --- | --- |
| `readFile(path)` | Gives the bytes of a file. Throws when there is no file. |
| `writeFile(path, data)` | Creates or replaces a file. Creates the missing parent folders. |
| `stat(path)` | Gives `{ type, size, mtimeMs }`, or `undefined` when nothing is at `path`. |
| `readdir(path)` | Gives the entries of a folder. A link has the type `'link'`. |
| `exec(command, options)` | Runs a shell command and waits. Gives `{ exitCode, stdout, stderr }`. |

`exec` resolves with the exit code of a command that fails. It does not throw. After `options.timeoutMs`, it stops the command with every process that it started, and gives exit code 124.

The backend can also have:

| Member | What it does | Without it |
| --- | --- | --- |
| `shell` | `'sh'` or `'cmd'`. Sets the path style and how arguments are quoted. | `sh` quotes, and the path style of this machine. |
| `remove(path)` | Removes one file. | `patch` cannot delete or move files. |
| `realpath(path)` | Gives the path with every link resolved. | The tools do not check links. |
| `spawn(command, options)` | Starts a command in the background. | `background: true` gives an error. |

The fastest start is to wrap `hostBackend`. This backend logs each command before it runs:

```ts group=harness-coding-tools-backends
import { hostBackend, workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import type { WorkspaceBackend } from '@tanstack/ai-harness/plugins/coding'

const root = process.cwd()

const logged: WorkspaceBackend = {
  ...hostBackend,
  exec: (command, options) => {
    console.log(`$ ${command}`)
    return hostBackend.exec(command, options)
  },
}

export const loggedTools = workspaceTools({ root, backend: logged })
```

Only `hostBackend` itself uses the `@vscode/ripgrep` binary. A wrapped backend uses `rg` on the `PATH`.

## Run code after a read or a write

Another plugin can add code that runs after the tools read or write a file. Add a `WorkspaceHooks` item:

```ts group=harness-coding-tools-backends
import { definePlugin } from '@tanstack/ai-harness'
import { WorkspaceHooks } from '@tanstack/ai-harness/plugins/coding'

export const generatedFiles = definePlugin({
  name: 'acme/generated-files',
  setup: () => ({
    contribute: [
      WorkspaceHooks.item({
        afterRead: async (path) =>
          path.endsWith('.gen.ts')
            ? 'This file is generated. Change its source, not this file.'
            : undefined,
        afterWrite: async (path) => {
          console.log(`changed ${path}`)
        },
      }),
    ],
  }),
})
```

- `afterRead` gets the absolute path. The text that it gives is added after the lines that `read_file` shows.
- `afterWrite` runs after `write_file`, `edit_file`, and `patch`.
- A hook runs while the tool holds the lock on that path. A hook that throws fails the tool call.

Add the plugin next to the tools: `plugins: () => [workspaceTools({ root }), generatedFiles]`.

## Format each file after a write

The model writes code that your formatter changes later, and the diff gets noisy. `formatter()` formats each file that the tools write:

```ts group=harness-coding-tools-backends
import { defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { formatter } from '@tanstack/ai-harness/plugins/coding'
import { openaiText } from '@tanstack/ai-openai'

export const formatted = defineHarness({
  name: 'acme/formatted-coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    permissions({ root }),
    workspaceTools({ root }),
    formatter({ root }),
  ],
})
```

At the first write of a session, `formatter()` looks at the files in `root`. For each file, the first formatter that the project uses for that file type runs.

For JavaScript, TypeScript, JSON, CSS, and other web files:

| Formatter | Runs when `root` has |
| --- | --- |
| prettier | `.prettierrc*`, `prettier.config.*`, or a `prettier` field in `package.json` |
| biome | `biome.json` or `biome.jsonc` |
| oxfmt | `.oxfmtrc*`, or `oxfmt` in the `devDependencies` |

These three run with `npx --no-install`, so the project must have them installed.

For other languages:

| Formatter | Files | Runs when `root` has |
| --- | --- | --- |
| ruff | `.py`, `.pyi` | `ruff.toml`, `.ruff.toml`, or `[tool.ruff]` in `pyproject.toml` |
| gofmt | `.go` | `go.mod` |
| rustfmt | `.rs` | `Cargo.toml` |

Add your own formatter. Your formatters come before the built-in ones:

```ts group=harness-coding-tools-backends
export const withToml = formatter({
  root,
  formatters: [
    {
      name: 'taplo',
      extensions: ['.toml'],
      command: (file) => `taplo fmt ${file}`,
    },
  ],
})
```

- `command` gets the absolute path, already quoted for the shell.
- `when(project)` limits a formatter to some projects. Without it, the formatter is used in every project.
- `builtins: false` turns the built-in formatters off.
- `timeoutMs` limits each run. The default is 20 seconds.
- In a sandbox, give `formatter()` the same `backend` as `workspaceTools()`.

A formatter that fails, stops at the time limit, or is not installed does not fail the tool call. The file stays as the tool wrote it, and the plugin sends `FormatFailed`:

```ts group=harness-coding-tools-backends
import { FormatFailed } from '@tanstack/ai-harness/plugins/coding'

export const formatAlerts = definePlugin({
  name: 'acme/format-alerts',
  setup: (ctx) => {
    ctx.on(FormatFailed, (failure) =>
      console.warn(`${failure.path}: ${failure.message}`),
    )
  },
})
```

Clients get the same event as a `harness.plugin.event` with the name `tanstack/formatter:failed`.

## Keep tool output small

One tool result with a full log or a big JSON file fills the context of the model. `boundToolOutput()` cuts every tool result that is too long:

```ts group=harness-coding-tools-backends
import { boundToolOutput } from '@tanstack/ai-harness/plugins'

export const bounded = defineHarness({
  name: 'acme/bounded-coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    workspaceTools({ root }),
    boundToolOutput({ dir: '.agent/tool-output' }),
  ],
})
```

- A result over 2000 lines or 50 KiB keeps its first lines and gets a note. Set other limits with `maxLines` and `maxBytes`.
- With `dir`, the full output goes to a file in `dir`, and the note gives the path. Files older than `retentionDays` (default 7) are removed.
- It cuts the result of every tool, MCP tools too, in the lead turn and in agent runs.
- An error stays an error. Images and other content parts do not change.

`read_file` and `bash` keep their output inside the default limits, so `boundToolOutput()` does not cut them again.

## What you have now

- The coding tools in a sandbox, with one option.
- A backend of your own for another place.
- Code that runs after each read and each write.
- Formatted files after each write, and tool results that fit the context.

Next: let the user undo the changes of a turn with [snapshots](./snapshots).
