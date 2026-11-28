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

# @tanstack/ai-sandbox-runta

Runta sandbox provider for TanStack AI

Runs harness adapters inside isolated [Runta](https://runta.com) microVM runtimes through the uniform `SandboxHandle`.

## Installation

```bash
npm install @tanstack/ai-sandbox-runta
# or
pnpm add @tanstack/ai-sandbox-runta
# or
yarn add @tanstack/ai-sandbox-runta
```

## Usage

```typescript
import { runtaSandbox } from '@tanstack/ai-sandbox-runta'

const runta = runtaSandbox({ apiKey: process.env.RUNTA_TOKEN })
```

Hand the provider to a sandboxed run the same way as any other; see the [sandbox docs](https://tanstack.com/ai/latest/docs/sandbox/overview) for the surrounding wiring.

- **Auth / env:** needs `RUNTA_TOKEN`; override the API endpoint with `apiUrl` or `RUNTA_ENDPOINT`.
- **Snapshot / resume:** resume-by-id reconnects to the named runtime and wakes it when it is paused or suspended. `snapshot()` creates a Runta checkpoint, and `restoreSnapshot()` creates a new runtime from it, so a snapshot survives deletion of its runtime.
- **Ports:** `ports.connect(port)` publishes the port at `https://<port>-<runtime id>.runta.dev`. The URL has no auth.
- **Idle:** a runtime runs until it is destroyed. Set `idleSuspendAfterSecs` to suspend an idle one.

## Documentation

- [Sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview): what a sandbox run is and how the pieces fit
- [Providers](https://tanstack.com/ai/latest/docs/sandbox/providers): every provider side by side, with the capability matrix
- [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses) and [Harness auth](https://tanstack.com/ai/latest/docs/sandbox/auth): what runs inside, and how it signs in

## License

MIT
