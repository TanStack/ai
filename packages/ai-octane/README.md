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
        {(message.role +
          ': ' +
          message.parts
            .map((part) => (part.type === 'text' ? part.content : ''))
            .join('')) as string}
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
  hook's state update; upstream 0.17.0 currently drops the external callback.
- Changing `useChat`'s connection or fetcher updates the active `ChatClient` in
  place and preserves conversation state; upstream 0.17.0 captures the initial
  transport.

## Status

This binding was developed as `@octanejs/tanstack-ai` in the
[octanejs/octane](https://github.com/octanejs/octane) repo as a temporary
stopgap, and moved here unchanged apart from the rename.

It is baselined against `@tanstack/ai-react@0.17.0`. Current scope, divergences,
and verification state are tracked in [`status.json`](./status.json) — including
the upstream changes not yet reflected here.

The port runs TanStack AI's React adapter tests against Octane across all eleven
hooks, with no skipped, todo, or expected-failure cases (except the untestable
auto-resume case noted in `status.json`). An SSR fixture and the upstream
compile-time type tests are also included.

## License

MIT — contains source derived from
[TanStack AI](https://github.com/TanStack/ai) (MIT), adapted for Octane.
