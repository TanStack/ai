# `ag-ui-compliance` codemod

Migrates client-side TanStack AI code from the legacy field names to the AG-UI–compliant ones introduced in the AG-UI client/server compliance release.

> **Heads up — nothing breaks if you skip this.** The legacy names continue to work via deprecation bridges. Run this codemod when you want to clean up your codebase and remove deprecation warnings. See [`docs/migration/ag-ui-compliance.md`](../../docs/migration/ag-ui-compliance.md) for the full migration story.

## What it does

| Before | After |
|---|---|
| `useChat({ body: {...} })` | `useChat({ forwardedProps: {...} })` |
| `new ChatClient({ body: {...} })` | `new ChatClient({ forwardedProps: {...} })` |
| `client.updateOptions({ body: {...} })` | `client.updateOptions({ forwardedProps: {...} })` |
| `chat.updateBody(x)` *(Svelte)* | `chat.updateForwardedProps(x)` |
| `chat({ conversationId: x })` | `chat({ threadId: x })` |

Each rename is gated by an **import-source check** — the codemod only rewrites a call site if the relevant identifier (`useChat`, `ChatClient`, etc.) is imported from a known TanStack AI package in the same file. Files that just happen to use a `body` key on unrelated object literals are left untouched.

## What it doesn't do

- **Server-side `body.data.X` rewrites.** Detecting which `body.data.foo` reads belong to a TanStack AI route handler vs. unrelated code requires more context than a syntactic codemod can reliably provide. Migrate these by hand using the recipes in [`docs/migration/ag-ui-compliance.md`](../../docs/migration/ag-ui-compliance.md).
- **Re-exports and aliases.** If you re-export `useChat` from a barrel file (`export { useChat } from '@tanstack/ai-react'`), call sites that import the re-export won't be matched. Update the import to come directly from the framework package, or run the codemod against the barrel file too.

## Running it

### Against your app

```bash
npx jscodeshift \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/ag-ui-compliance/transform.ts \
  "src/**/*.{ts,tsx}"
```

Preview changes without writing them:

```bash
npx jscodeshift --dry --print \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/ag-ui-compliance/transform.ts \
  "src/**/*.{ts,tsx}"
```

### Against this repo's examples

```bash
pnpm codemod:ag-ui-compliance "examples/**/*.{ts,tsx}"
```

## Conflict handling

If an object literal already declares **both** the legacy and the canonical key — for example, `useChat({ body: {...}, forwardedProps: {...} })` — the codemod leaves it alone and prints a warning of the form:

```
[ag-ui-compliance] path/to/file.tsx:42 — useChat({ body }): both legacy
  and canonical keys are already present; left alone. Merge by hand.
```

Renaming would produce a duplicate-key object literal and silently drop one of the two values; resolving the merge is a judgment call only the author can make. Search the codemod's output for `[ag-ui-compliance]` lines and merge each call site manually.

## Limits and verification

- Test fixtures cover the supported call-site shapes; out-of-shape uses (e.g., `useChat(...spread)`) are skipped.
- Run your test suite after the codemod completes — the rewrite is mechanical, not semantic, so unusual patterns may need manual review.
