# @tanstack/ai-sandbox-docker

Sandbox providers that run a TanStack AI harness on Docker.

- `dockerSandbox({ image })` starts a **container** through the Docker daemon.
- `sbxSandbox()` starts a **Docker Sandboxes** microVM through the `sbx` CLI.

```ts
import { dockerSandbox, sbxSandbox } from '@tanstack/ai-sandbox-docker'

const container = dockerSandbox({ image: 'node:22' })
const microvm = sbxSandbox()
```

`sbxSandbox()` needs `sbx` on `PATH`, `sbx login`, a hypervisor, and a Git repo to pass to `sbx create --clone`. See the [providers guide](https://tanstack.com/ai/latest/docs/sandbox/providers).
