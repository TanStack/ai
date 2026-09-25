<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-sandbox-docker

Sandbox providers that run a TanStack AI harness on Docker.

- `dockerSandbox({ image })` starts a **container** through the Docker daemon.
- `sbxSandbox()` starts a **Docker Sandboxes** microVM through the `sbx` CLI.

```ts
import { dockerSandbox, sbxSandbox } from '@tanstack/ai-sandbox-docker'

const container = dockerSandbox({ image: 'node:22' })
const microvm = sbxSandbox({
  allowNetwork: ['*.npmjs.org', 'registry.npmjs.org'],
})
```

`sbxSandbox()` needs `sbx` on `PATH`, `sbx login`, a hypervisor, and a Git
repo to pass to `sbx create --clone`. Pass `allowNetwork` when you use a
deny or ask policy, or when you need extra hosts besides the model API host
and `localhost`. See the [providers guide](https://tanstack.com/ai/latest/docs/sandbox/providers).
