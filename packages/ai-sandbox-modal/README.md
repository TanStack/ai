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

# @tanstack/ai-sandbox-modal

Run TanStack AI agents in isolated [Modal](https://modal.com/docs/guide/sandbox) sandboxes through the `SandboxProvider` contract.

```sh
pnpm add @tanstack/ai-sandbox @tanstack/ai-sandbox-modal
```

Set `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`, then create a provider:

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { modalSandbox } from '@tanstack/ai-sandbox-modal'

export const sandbox = defineSandbox({
  id: 'modal-agent',
  provider: modalSandbox({ appName: 'tanstack-ai-agent' }),
})
```

The provider uses the `node:24-slim` image, `/workspace` as its work directory, and a 30 minute sandbox lifetime by default. Set `image`, `workdir`, `timeoutMs`, and `ports` to change these values. Set `environment` to use a specific Modal environment.

The provider supports sandbox creation, resume by the Modal sandbox ID or the `input.id` name used at creation, destruction, shell commands, filesystem operations, environment overlays, and configured encrypted port tunnels. Name lookup uses the configured App and environment. It does not support native snapshots, fork, durable filesystem across sandbox termination, or process-level kill. An aborted command terminates its sandbox so the command cannot remain running. This also ends other work in that sandbox.
