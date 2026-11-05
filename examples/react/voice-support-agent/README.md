# Voice Support Agent

A phone support agent for TanStack AI. Talk into your microphone, and the agent answers from the docs. Point a Twilio number at it to take real calls.

Each hop of the call, listen, think, and speak, runs on OpenAI, Gemini, or Grok. Pick a provider per hop on the page and paste your own keys in the key dialog, or put keys in `.env.local`.

## Run it

1. From the repo root, run `pnpm install`, then `pnpm build`.
2. Copy `.env.example` to `.env.local` and set a key, or paste keys into the page later.
3. Run `pnpm --filter voice-support-agent dev`.
4. Open http://localhost:3100, pick a character and providers, and click the green handset.
5. Ask "How do I add a server tool?" and pause.

The agent speaks after about one second. Talk over it to interrupt.

Characters live in `src/server/characters.ts`: helpful, startup founder, frightfully posh, surfie, total brat, and about to lose it. Each one is a persona for the chat model plus a voice, speed, and delivery note for the speech model.

## Take a phone call

1. Run `ngrok http 3100` and copy the `https` host.
2. In Twilio, set the number's voice webhook to return this TwiML:

```xml
<Response>
  <Connect>
    <Stream url="wss://YOUR-NGROK-HOST/twilio?character=surfie&amp;speak=gemini" />
  </Connect>
</Response>
```

3. Call the number.

## Files

- `src/routes/index.tsx`: the softphone page. Microphone in, audio out, captions.
- `src/lib/hops.ts`: the providers offered per hop.
- `src/lib/byok.ts`: the browser keyring and the server-key status.
- `src/components/ByokKeyDialog.tsx`: the key dialog, copied from `ts-react-chat`.
- `src/server/characters.ts`: the personas and voices.
- `src/server/providers.ts`: builds the adapters and reads keys.
- `src/server/call.ts`: one call. Transcribe, answer with `chat()`, speak each sentence.
- `src/server/search-docs.ts`: the tool that reads the TanStack AI docs.
- `src/server/carriers.ts`: audio framing for the browser and for Twilio.
- `src/server/vite-plugin.ts`: hosts the `/voice` and `/twilio` sockets on the dev server.
