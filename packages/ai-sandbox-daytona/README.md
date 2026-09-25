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

# @tanstack/ai-sandbox-daytona

Daytona sandbox provider for TanStack AI

Runs harness adapters inside isolated [Daytona](https://daytona.io) cloud sandboxes through the uniform `SandboxHandle` — a managed remote VM you do not run yourself.

## Installation

```bash
npm install @tanstack/ai-sandbox-daytona
# or
pnpm add @tanstack/ai-sandbox-daytona
# or
yarn add @tanstack/ai-sandbox-daytona
```

## Usage

```typescript
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'

const daytona = daytonaSandbox({
  apiKey: process.env.DAYTONA_API_KEY,
  snapshot: 'daytona-medium',
  autoStopInterval: 0,
})
```

Hand the provider to a sandboxed run the same way as any other; see the [sandbox docs](https://tanstack.com/ai/latest/docs/sandbox/overview) for the surrounding wiring.

- **Auth / env:** needs `DAYTONA_API_KEY`. Harness credentials go in workspace secrets; Daytona stores each value as an organization Secret and substitutes it on outbound HTTPS requests, so the real value never appears in the create record, the dashboard, or a command string.
- **Snapshot / resume:** point-in-time snapshots after setup, and resume starts a `stopped` or `archived` sandbox before returning the handle.
- **Bridge:** it is a remote VM, so bridged tools need the tunnel in local dev.

## Documentation

- [Sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview): what a sandbox run is and how the pieces fit
- [Providers](https://tanstack.com/ai/latest/docs/sandbox/providers): every provider side by side, with the capability matrix
- [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses) and [Harness auth](https://tanstack.com/ai/latest/docs/sandbox/auth): what runs inside, and how it signs in

## License

MIT
