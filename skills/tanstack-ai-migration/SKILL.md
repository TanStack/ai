---
name: tanstack-ai-migration
description: >
  Move an app to TanStack AI from the Vercel AI SDK or raw provider SDKs, or
  upgrade it from TanStack AI 0.x to 1.0. Use when someone asks
  whether to switch AI libraries, when code mixes streamText, generateText,
  generateObject, createOpenAI, or @ai-sdk/* with TanStack AI, when an upgrade
  breaks, or when someone hits a renamed option, a deprecated -ui package, or an
  old adapter shape. Triggers on "migrate", "switch from Vercel AI SDK",
  "ai-sdk", "streamText", "upgrade TanStack AI", "deprecated",
  "breaking change", "codemod".
---

# Migrating to TanStack AI

Two different jobs. Pick the one that matches the code in front of you.

## Coming from another SDK

The name-by-name mapping lives in the docs, and it is longer than any summary
that fits here:

https://tanstack.com/ai/latest/docs/migration/migration-from-vercel-ai

The shape of the change:

- `streamText` and `generateText` become one `chat()` call with a streaming
  option.
- `createOpenAI(...)` becomes a tree-shakeable adapter, such as `openaiText()`
  from `@tanstack/ai-openai`.
- `onFinish` and friends become middleware hooks.
- Manual SSE wiring becomes the built-in response helpers.
- `generateObject` becomes structured outputs on `chat()`.

Read the guide, then load the target API's own skill with
`npx @tanstack/intent@latest load @tanstack/ai#ai-core`. Do not port from memory: a half-remembered mapping produces
code that type-checks in neither SDK.

To port one side at a time, `@tanstack/ai-ui-message-stream` connects the two
SDKs over the AI SDK UI message stream. It is a stop gap while porting, not a
place to stay: finish the port of the other side, then remove it.

- Server first: keep AI SDK `useChat` and serve it from `chat()` with
  `chat({ adapter, ...(await chatParamsFromAISDKRequest(request)) })` and
  `toUIMessageStream`.
  https://tanstack.com/ai/latest/docs/migration/ai-sdk-client-tanstack-server
- Client first: keep the `streamText` route and pass
  `fromChatTransport(new DefaultChatTransport({ api }), { threadId, tools })`
  as the `connection` of TanStack `useChat`.
  https://tanstack.com/ai/latest/docs/migration/tanstack-client-ai-sdk-server

Tool approvals, client tools, activity, subagents and stream resume cross the
bridge. Shared state goes from a TanStack server to an AI SDK client only.

## Upgrading TanStack AI itself

Start with the version the app has, and the current release:

```bash
node -p "require('@tanstack/ai/package.json').version"
npm view @tanstack/ai version
```

Then read the guides for what changed:

- https://tanstack.com/ai/latest/docs/migration/v1 (0.x to 1.0)
- https://tanstack.com/ai/latest/docs/migration/migration
- https://tanstack.com/ai/latest/docs/migration/ag-ui-compliance
- https://tanstack.com/ai/latest/docs/migration/sampling-options-to-model-options

1.0 removes every API that 0.x marked as deprecated. Each one has a
replacement that already shipped in 0.x, so you can move to the replacements
on 0.x first, then bump every `@tanstack/ai*` package to 1.0 together.

## Codemods

Some renames have a jscodeshift transform. Run it straight from the repo, and
preview first with `--dry --print`:

```bash
npx jscodeshift \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/ag-ui-compliance/transform.ts \
  --dry --print src/
```

Each guide names the codemod that covers it, and what the codemod cannot reach.
Server-side rewrites are usually manual.

## After the port

Run the project's type checker. Most errors after a migration come from an API
that was remembered rather than read, so check the failing name against
`node_modules/@tanstack/ai/src/` before changing it again.
