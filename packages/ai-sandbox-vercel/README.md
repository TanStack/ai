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

# @tanstack/ai-sandbox-vercel

Vercel Sandbox provider for TanStack AI

Runs harness adapters inside isolated [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) microVMs through the uniform `SandboxHandle`.

## Installation

```bash
npm install @tanstack/ai-sandbox-vercel
# or
pnpm add @tanstack/ai-sandbox-vercel
# or
yarn add @tanstack/ai-sandbox-vercel
```

## Usage

```typescript
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'

const vercel = vercelSandbox({ runtime: 'node24' })
```

Hand the provider to a sandboxed run the same way as any other; see the [sandbox docs](https://tanstack.com/ai/latest/docs/sandbox/overview) for the surrounding wiring.

- **Auth / env:** needs `VERCEL_TOKEN` plus a team and project. Harness credentials are injected as workspace secrets.
- **Snapshot / resume:** persistent resume-by-id with a durable filesystem, plus exposed-port domains for previews.
- **Bridge:** it is a remote VM, so bridged tools need the tunnel in local dev.

## Documentation

- [Sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview): what a sandbox run is and how the pieces fit
- [Providers](https://tanstack.com/ai/latest/docs/sandbox/providers): every provider side by side, with the capability matrix
- [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses) and [Harness auth](https://tanstack.com/ai/latest/docs/sandbox/auth): what runs inside, and how it signs in

## License

MIT
