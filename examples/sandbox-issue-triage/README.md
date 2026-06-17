# Sandbox issue triage

Fetches the first **open** issue on [`TanStack/ai`](https://github.com/TanStack/ai/issues),
spins up a sandbox with the repo cloned in, runs **Claude Code inside the
sandbox** to investigate and triage the issue, and writes a Markdown report to
your local `reports/` directory.

It demonstrates three pieces of the sandbox layer together:

- **`@tanstack/ai-sandbox`** workspace bootstrap (`githubRepo` source → clone).
- The **`@tanstack/ai-claude-code`** harness adapter running the `claude` CLI
  inside the sandbox.
- **Sandbox file-event hooks** — `watchWorkspace()` logs the agent's
  create/change/delete events live, and `withSandboxFileEvents()` surfaces them
  into the `chat()` stream as CUSTOM `sandbox.file` events. The observed events
  are appended to the report.

Two entrypoints, same logic ([`triage.ts`](./triage.ts)):

| Command | Sandbox | Isolation |
| --- | --- | --- |
| `pnpm start:process` | local-process (host) | none — fast dev loop |
| `pnpm start:docker` | Docker container | full |

## Prerequisites

- **Both:** `ANTHROPIC_API_KEY` in your environment (the local-process variant
  can instead use an existing `claude` login).
- **`start:process`:** `git`, `node`, and the `claude` CLI on your PATH.
- **`start:docker`:** a running Docker daemon. The base image (`node:22`)
  already has `git` + `node`; the `claude` CLI is installed during setup.
- Optional: `GITHUB_TOKEN` to avoid GitHub API rate limits.
- Optional: `SANDBOX_IMAGE` to override the Docker base image.

## Run

```bash
# from the repo root, build the workspace packages first
pnpm build

cd examples/sandbox-issue-triage
pnpm install

# local-process sandbox
ANTHROPIC_API_KEY=sk-... pnpm start:process

# docker sandbox
ANTHROPIC_API_KEY=sk-... pnpm start:docker
```

The report lands at `reports/issue-<number>-<process|docker>.md`.

> Note: the workspace clones the **default branch** of `TanStack/ai` into the
> sandbox. The first run pulls the full repo, so give it a moment.
