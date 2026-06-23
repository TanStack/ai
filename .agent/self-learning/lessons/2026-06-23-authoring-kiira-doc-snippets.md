---
name: authoring-kiira-doc-snippets
description: Use when writing or fixing TypeScript/TSX code samples in tanstack/ai docs (docs/**) so they type-check under kiira AND read as idiomatic, type-safe examples
tags: [documentation, kiira, type-safety, code-samples]
scope: repo
source:
  type: user-correction
  created: 2026-06-23T00:00:00Z
related_skill: null
related: [update-docs-with-new-cases, kiira-ci-setup]
---

# Doc Code Samples: Make Them Real and Type-Safe, Not "Made to Pass"

**Rule:** A doc snippet must type-check under kiira (`pnpm kiira check`) _by being
a correct, minimal, real example_ — never by papering over a missing piece. The
maintainer rejected every shortcut below. Apply these when authoring or fixing
`docs/**` code fences.

**Why:** During the kiira rollout, agents drove snippets to zero errors using
fast hacks — `declare const`, an invisible "ambient" fixture, grouping unrelated
snippets and renaming collisions (`client`/`client1`), `(input: any)` on tool
callbacks, an `as` cast. Each passed the checker while making the rendered doc
worse or hiding a real type. The maintainer caught them one by one. The checker
is a means (keep examples honest), not the end (a green check).

**How to apply — the banned shortcuts and what to do instead:**

1. **Never `declare const x`.** It's invisible magic the reader can't act on.
   Show real minimal setup for where the value comes from:
   - `messages` → server-side: wrap in an endpoint and extract it
     (`export async function POST(request: Request) { const { messages } = await request.json(); ... }`);
     client-side: it comes from the hook (`const { messages } = useChat({...})`);
     otherwise a minimal literal `const messages = [{ role: 'user', content: 'Hello' }]`.
   - an adapter → `import { openaiText } from '@tanstack/ai-openai'; const adapter = openaiText('gpt-5.5')`.
   - tools → define inline with `toolDefinition({ name, description, inputSchema })`.
   - any other arbitrary placeholder (db, env, a client, a token) → import it from
     a relative module: `import { db } from './db'`. kiira ignores unresolved
     _relative_ imports, so the name is a usable `any` and the reader sees they
     must supply it.

2. **No invisible "ambient" fixture for `messages`/`message`.** Same reason as #1
   — the reader sees a variable appear from nowhere. Use real visible setup.

3. **ANY explicit type on a `.client()` / `.server()` tool callback param is a
   smell** — not just `any`, but also `unknown` and a hand-written shape like
   `(input: { key: string; value: string })`. All three mean the
   `toolDefinition` isn't in scope (e.g. imported from an unresolved
   `./tool-definitions`), so the inferred input type was lost and someone
   re-typed it by hand. Define the
   `toolDefinition({ name, description, inputSchema: z.object({...}) })` inline in
   the snippet; then `.client((input) => ...)` infers `input` from the schema
   with NO annotation. The tools are fully type-safe — re-typing the param
   defeats the demonstration and drifts from the schema. (Only legitimate
   exception: a tool with no `inputSchema` at all — then the unused param may be
   `_input: unknown`.)

4. **Isolate snippets; don't group-and-rename.** Don't tag fences `group=` and
   rename collisions (`client`→`client1`, `stream`→`stream2`,
   `adapter`→`adapterNoTypeInference`, `MyComponent`→`MyComponentB`) just to dodge
   "Cannot redeclare". Make each fence stand alone with natural names, sharing
   setup by repeating a minimal block or importing it from a relative file
   (`import { client } from './client'`). Keep `group=` only for a genuine
   sequential example that never redeclares.

5. **Never add an `as` type cast** (`as const` / `satisfies` / non-null `!` are
   fine). If a value is `unknown`, narrow with `instanceof`/`typeof`/`in` or a
   guard. If you "need" a cast to make a type line up (e.g.
   `messages as UIMessage<Recipe>[]`), that usually means the example is asserting
   a type the API doesn't actually produce — investigate, don't assert.

6. **Don't add a callback return-type annotation just to silence the checker**
   (e.g. `onBeforeToolCall: (ctx, h): BeforeToolCallDecision => {`). The config
   sets `noImplicitReturns: false` for docs, so a hook that returns on some
   branches and falls through on others is fine un-annotated.

7. **`ignore` is the last resort,** only for genuinely un-checkable fences:
   competitor SDKs not installed (`ai`, `@ai-sdk/*`), uninstalled community
   adapters, framework route-registration boilerplate (`createFileRoute`). Never
   `ignore` to mask a fixable error.

**Heuristic:** before committing a snippet fix, ask "did I make the example more
correct, or just make the error go away?" If a reader copying this snippet would
be misled or get an `any` where the real API is typed, it's the second — redo it.
