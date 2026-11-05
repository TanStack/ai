# Voice Support Agent

A phone support agent for TanStack AI. Talk into your microphone, and the agent answers from the docs. Point a Twilio number at it to take real calls.

## Run it

1. From the repo root, run `pnpm install`, then `pnpm build`.
2. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`.
3. Run `pnpm --filter voice-support-agent dev`.
4. Open http://localhost:3100 and click Start call.
5. Ask "How do I add a server tool?" and pause.

The agent speaks after about one second. Talk over it to interrupt.

## Take a phone call

1. Run `ngrok http 3100` and copy the `https` host.
2. In Twilio, set the number's voice webhook to return this TwiML:

```xml
<Response>
  <Connect>
    <Stream url="wss://YOUR-NGROK-HOST/twilio" />
  </Connect>
</Response>
```

3. Call the number.

## Files

- `src/routes/index.tsx`: the softphone page. Microphone in, audio out, captions.
- `src/server/call.ts`: one call. Transcribe, answer with `chat()`, speak each sentence.
- `src/server/search-docs.ts`: the tool that reads the TanStack AI docs.
- `src/server/carriers.ts`: audio framing for the browser and for Twilio.
- `src/server/vite-plugin.ts`: hosts the `/voice` and `/twilio` sockets on the dev server.
