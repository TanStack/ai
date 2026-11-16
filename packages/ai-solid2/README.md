<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?framework=solid&theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png?framework=solid"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png?framework=solid"
      alt="TanStack Solid 2 AI"
      width="900"
    />
  </picture>
</div>

# @tanstack/ai-solid2

Use TanStack AI in a Solid 2 app. For Solid 1, use `@tanstack/ai-solid`.

## Install

```bash
pnpm add @tanstack/ai @tanstack/ai-solid2 solid-js@^2.0.0-rc.21 @solidjs/web@^2.0.0-rc.21
pnpm add -D @solidjs/vite-plugin@3.0.0-next.57
```

Set `jsxImportSource` to `@solidjs/web` in your TypeScript config. Use `@solidjs/vite-plugin` to compile JSX.

The [Solid 2 guide](https://tanstack.com/ai/latest/docs/framework/solid2) includes the Vite config and a complete server/client chat example.

## Entry points

| Import                     | What it provides                                                        |
| -------------------------- | ----------------------------------------------------------------------- |
| `@tanstack/ai-solid2`      | Chat, generation, recorder, BYOK, and WebMCP hooks, plus client helpers |
| `@tanstack/ai-solid2/ui`   | Typed chat components and the UI `createChatHook` factory               |
| `@tanstack/ai-solid2/byok` | Framework-independent keyring helpers                                   |

Hooks keep the Solid 1 accessor shape. Read `messages()`, `isLoading()`, `error()`, or a generation hook's `result()`.

Pass reactive options through getters. Changes to `forwardedProps` keep the transcript. Changes to `threadId` select a new chat client.

Create hooks inside a component or an owned root. Disposal releases subscriptions and aborts the local stream connection.

## License

MIT
