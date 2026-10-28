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

# @tanstack/ai-sandbox-blaxel

Blaxel sandbox provider for TanStack AI

Runs harness adapters inside isolated [Blaxel](https://blaxel.ai) cloud sandboxes through the uniform `SandboxHandle`.

## Installation

```bash
npm install @tanstack/ai-sandbox-blaxel
# or
pnpm add @tanstack/ai-sandbox-blaxel
# or
yarn add @tanstack/ai-sandbox-blaxel
```

## Usage

```typescript
import { blaxelSandbox } from '@tanstack/ai-sandbox-blaxel'

const blaxel = blaxelSandbox({
  apiKey: process.env.BL_API_KEY,
  workspace: process.env.BL_WORKSPACE,
})
```

Hand the provider to a sandboxed run the same way as any other; see the [sandbox docs](https://tanstack.com/ai/latest/docs/sandbox/overview) for the surrounding wiring.

- **Auth / env:** pass `apiKey` and `workspace`, or set `BL_API_KEY` and `BL_WORKSPACE`. `@blaxel/core` authentication is process-global, so the provider records the resolved workspace at construction and rejects a later provider asking for a different one.
- **Image / size / region:** `image` (default `blaxel/base-image:latest`), `memory` (default 2048 MB), and `region` (or `BL_REGION`).
- **Lifetime:** created sandboxes carry a `1h` TTL so an abandoned run cannot strand a paid sandbox. Override with `ttl`, or pass `ttl: null` to manage it yourself.
- **Snapshot / resume:** resume-by-id reconnects to the named sandbox. Blaxel's snapshot/fork API is a private preview today, so this provider advertises `snapshots` and `fork` as `false` rather than claiming a guarantee it cannot meet.

## Documentation

- [Sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview): what a sandbox run is and how the pieces fit
- [Providers](https://tanstack.com/ai/latest/docs/sandbox/providers): every provider side by side, with the capability matrix
- [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses) and [Harness auth](https://tanstack.com/ai/latest/docs/sandbox/auth): what runs inside, and how it signs in

## License

MIT
