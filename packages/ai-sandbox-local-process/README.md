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

# @tanstack/ai-sandbox-local-process

Local-process sandbox provider for TanStack AI

Runs the harness directly on your host through the uniform `SandboxHandle`, so you can develop an agent without provisioning anything.

> **There is no isolation.** The harness inherits your host environment and there is no boundary between the agent and your machine. Use this for trusted or dev work only; reach for one of the cloud providers when the code is not yours.

## Installation

```bash
npm install @tanstack/ai-sandbox-local-process
# or
pnpm add @tanstack/ai-sandbox-local-process
# or
yarn add @tanstack/ai-sandbox-local-process
```

## Usage

```typescript
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const dev = localProcessSandbox()
```

Hand the provider to a sandboxed run the same way as any other; see the [sandbox docs](https://tanstack.com/ai/latest/docs/sandbox/overview) for the surrounding wiring.

- **Auth / env:** inherits the host environment. Which credentials the harness uses is set by `authMode` on the harness (`'host'` or `'api-key'`), not by the provider.
- **Snapshot / resume:** none. Each run re-creates and re-bootstraps under the same identity, and the snapshot step is skipped silently.

## Documentation

- [Sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview): what a sandbox run is and how the pieces fit
- [Providers](https://tanstack.com/ai/latest/docs/sandbox/providers): every provider side by side, with the capability matrix
- [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses) and [Harness auth](https://tanstack.com/ai/latest/docs/sandbox/auth): what runs inside, and how it signs in

## License

MIT
