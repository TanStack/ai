---
name: tanstack-ai-migration
description: >
  Move an app to TanStack AI from the Vercel AI SDK or raw provider SDKs, or
  move it off a deprecated TanStack AI API. Use when someone asks
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

## Upgrading TanStack AI itself

Start with the version the app has, and the current release:

```bash
node -p "require('@tanstack/ai/package.json').version"
npm view @tanstack/ai version
```

Then read the guides for what changed:

- https://tanstack.com/ai/latest/docs/migration/migration
- https://tanstack.com/ai/latest/docs/migration/ag-ui-compliance
- https://tanstack.com/ai/latest/docs/migration/sampling-options-to-model-options
- https://tanstack.com/ai/latest/docs/migration/create-ui

Deprecated APIs keep working, so upgrade in steps rather than rewriting
everything at once.

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
