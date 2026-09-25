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

# @tanstack/ai-sandbox-sprites

Sprites sandbox provider for TanStack AI

Runs harness adapters inside isolated [Sprites](https://sprites.dev) stateful sandboxes (Fly.io) through the uniform `SandboxHandle`.

## Installation

```bash
npm install @tanstack/ai-sandbox-sprites
# or
pnpm add @tanstack/ai-sandbox-sprites
# or
yarn add @tanstack/ai-sandbox-sprites
```

## Usage

```typescript
import { spritesSandbox } from '@tanstack/ai-sandbox-sprites'

const sprites = spritesSandbox({ apiKey: process.env.SPRITES_API_KEY })
```

Hand the provider to a sandboxed run the same way as any other; see the [sandbox docs](https://tanstack.com/ai/latest/docs/sandbox/overview) for the surrounding wiring.

- **Auth / env:** needs `SPRITES_API_KEY` (token form `org/projectNumber/tokenId/secret`); override the control-plane URL with `apiUrl` or `SPRITES_API_URL`.
- **Snapshot / resume:** resume-by-id reconnects to the named Sprite, whose filesystem is durable across idle suspend/resume. `snapshot()` creates a Sprite **checkpoint** restored in place through the handle's `restoreCheckpoint()` / `listCheckpoints()`; since a checkpoint does not survive Sprite deletion, the provider deliberately does not implement the reconstruct-after-gone `restoreSnapshot`.
- **Ports:** a Sprite proxies one internal HTTP port (default `8080`, set with `httpPort`) to its public URL.

## Documentation

- [Sandbox overview](https://tanstack.com/ai/latest/docs/sandbox/overview): what a sandbox run is and how the pieces fit
- [Providers](https://tanstack.com/ai/latest/docs/sandbox/providers): every provider side by side, with the capability matrix
- [Harnesses](https://tanstack.com/ai/latest/docs/sandbox/harnesses) and [Harness auth](https://tanstack.com/ai/latest/docs/sandbox/auth): what runs inside, and how it signs in

## License

MIT
