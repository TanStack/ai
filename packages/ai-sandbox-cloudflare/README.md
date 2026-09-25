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

# @tanstack/ai-sandbox-cloudflare

Cloudflare sandbox provider for TanStack AI

Runs harness adapters inside [Cloudflare Containers](https://developers.cloudflare.com/containers/) through the uniform `SandboxHandle`, so the agent and a live preview URL of what it builds run at the edge in one deploy.

Besides the provider, the package ships a ready-made agent coordinator: `@tanstack/ai-sandbox-cloudflare/agent` for apps composing directly, and `@tanstack/ai-sandbox-cloudflare/runner` for the container side.

## Installation

```bash
npm install @tanstack/ai-sandbox-cloudflare
# or
pnpm add @tanstack/ai-sandbox-cloudflare
# or
yarn add @tanstack/ai-sandbox-cloudflare
```

## Usage

```typescript
import { cloudflareSandbox } from '@tanstack/ai-sandbox-cloudflare'

const sandbox = cloudflareSandbox({ binding: env.Sandbox })
```

Hand the provider to a sandboxed run the same way as any other; see the [sandbox docs](https://tanstack.com/ai/latest/docs/sandbox/overview) for the surrounding wiring.

- **Durable runs:** a Durable Object keeps the run alive across client disconnects, so a run outlives the request that started it.
- **Entry points:** `.` for the provider, `./agent` for the coordinator, `./runner` for the container runtime.

## Documentation

- [Sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview): what a sandbox run is and how the pieces fit
- [Providers](https://tanstack.com/ai/latest/docs/sandbox/providers): every provider side by side, with the capability matrix
- [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses) and [Harness auth](https://tanstack.com/ai/latest/docs/sandbox/auth): what runs inside, and how it signs in

## License

MIT
