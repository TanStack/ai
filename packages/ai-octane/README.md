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

# @tanstack/ai-octane

[TanStack AI](https://tanstack.com/ai) bindings for the
[Octane](https://github.com/octanejs/octane) UI framework.

This package ports the `@tanstack/ai-react` hook surface onto Octane while
reusing `@tanstack/ai` and `@tanstack/ai-client` unchanged. The runtime export
surface matches the React adapter, so migration starts by changing the package
import:

```ts
// before
import { useChat } from '@tanstack/ai-react'

// after
import { useChat } from '@tanstack/ai-octane'
```

The renderer-bearing hook modules are authored as `.tsrx` and compiled by
Octane. Matching `.tsrx.d.ts` companions are checked declaration emits of those
implementations, preserving the complete generic surface for TypeScript
consumers.

Like Svelte packages shipping `.svelte`, this package publishes **uncompiled
source**: your Octane plugin (`octane/compiler/vite`, or the rspack / rspeedy
equivalents) compiles the `.tsrx` modules as part of your build. There is no
`dist`.

## Install

```bash
pnpm add @tanstack/ai-octane @tanstack/ai @tanstack/ai-client octane
```

## Usage

```tsx
import { useState } from 'octane'
import { useChat } from '@tanstack/ai-octane'

export function Chat() @{
  const [input, setInput] = useState('')
  const chat = useChat({
    fetcher: myFetcher,
  })

  <div>
    @for (const message of chat.messages; key message.id) {
      <p>
        {message.role}:
        {message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.content)
          .join('')}
      </p>
    }
    <input
      value={input}
      onInput={(event) => setInput(event.currentTarget.value)}
    />
    <button
      onClick={() => {
        void chat.sendMessage(input)
        setInput('')
      }}
    >
      Send
    </button>
  </div>
}
```

`useChat` has no input state of its own — hold the text box value in a local
`useState` and pass it to `sendMessage`. Note the `onInput` handler: Octane
drives text controls per keystroke through the native `input` event, not a
synthetic `onChange`.

## API

The adapter includes `useChat`, `useRealtimeChat`, `useMcpAppBridge`,
`useGeneration`, `useGenerateImage`, `useGenerateAudio`, `useGenerateSpeech`,
`useGenerateVideo`, `useTranscription`, `useSummarize`, and
`useAudioRecorder`. It also re-exports all 30 `@tanstack/ai-client`
convenience helpers and types (`fetchServerSentEvents`, `fetchHttpStream`,
`xhrServerSentEvents`, `xhrHttpStream`, `stream`, `rpcStream`,
`createChatClientOptions`, `createMcpAppBridge`, and their associated types)
unchanged, mirroring the `@tanstack/ai-react` index.

Server rendering through `octane/server` is supported. `useChat` renders its
initial message snapshot without browser-only setup.

## Divergences from `@tanstack/ai-react`

- The `./mcp-apps` subpath and its `MCPAppResource` component are not ported:
  they render `AppRenderer` from the React-only `@mcp-ui/client`, which has no
  Octane equivalent. The framework-agnostic `useMcpAppBridge` hook is ported
  and available on the main entry.
- Octane uses native events: text/file/recorder inputs drive updates via
  `onInput`; there is no synthetic `onChange` layer.
- Octane has no StrictMode double-invoke and always provides `useId`, so no
  random-id fallback is needed.
- The devtools bridge is tagged `framework: 'octane'` (upstream sends
  `'react'`), so the devtools identify this binding correctly.
- Realtime reconnects and token refreshes use the latest `getToken` and adapter
  supplied to the hook; upstream captures the first render's callbacks.
- The declared realtime `onStatusChange` callback is invoked alongside the
  hook's state update; upstream `@tanstack/ai-react` currently drops the
  external callback.
- Changing `useChat`'s connection or fetcher updates the active `ChatClient` in
  place and preserves conversation state.

### Fixed here, still present upstream

Three defects were found during review of the port and fixed rather than
mirrored. All are documented in [`status.json`](./status.json) and covered by
tests, and each is tracked upstream so the other adapters can catch up.

- `useAudioRecorder`'s transforming overload requires `onComplete`. Upstream,
  passing any unrelated option (`useAudioRecorder({ onError })`) matched the
  transforming overload, inferred `TOnComplete` as `unknown`, and silently
  collapsed `recording` and `stop()` to `unknown`.
  ([#1001](https://github.com/TanStack/ai/issues/1001))
- `useGeneration` spreads caller `devtools` metadata _before_ the hardcoded
  `framework`/`hookName`, so a caller can't misattribute the binding in the
  devtools. `ai-react` spreads it after; `ai-vue` and `ai-solid` already order it
  this way. ([#1002](https://github.com/TanStack/ai/issues/1002))
- `UseGenerationReturn<TInput, TOutput>` types `generate` as `(input: TInput)`.
  Upstream declares `UseGenerationReturn<TOutput>` and widens `generate` to
  `(input: Record<string, any>)`, so narrow or required input fields go
  unchecked. **This is the one place the public type surface differs in shape
  from `@tanstack/ai-react`** — the runtime surface is unchanged, so the
  "change the import" migration still holds.
  ([#1003](https://github.com/TanStack/ai/issues/1003))

## Status

This binding was developed as `@octanejs/tanstack-ai` in the
[octanejs/octane](https://github.com/octanejs/octane) repo as a temporary
stopgap, and moved here — apart from the rename, the only changes are the three
fixes listed above and the test-helper hardening noted in `status.json`.

Current scope, divergences, and verification state are tracked in
[`status.json`](./status.json). `useChat` matches the current ChatClient shape
(`threadId` identity, queue, interrupts, `attach`/`detach`).

The port runs TanStack AI's React adapter tests against Octane across all eleven
hooks, with no skipped, todo, or expected-failure cases (except the untestable
auto-resume case noted in `status.json`). An SSR fixture and the upstream
compile-time type tests are also included.

## License

MIT — contains source derived from
[TanStack AI](https://github.com/TanStack/ai) (MIT), adapted for Octane.
