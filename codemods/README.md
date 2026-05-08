# TanStack AI codemods

[jscodeshift](https://github.com/facebook/jscodeshift) transforms for migrating between API versions of `@tanstack/ai` and friends.

Each codemod lives in its own subdirectory and is named after the migration it covers. Codemods are **opt-in modernizations** — the deprecated APIs they replace continue to work, so you can run them at your own pace.

## Available codemods

| Codemod | Migrates |
|---|---|
| [`ag-ui-compliance`](./ag-ui-compliance) | Client-side renames introduced by the AG-UI client/server compliance release: `body` → `forwardedProps` on `useChat` / `ChatClient` / `updateOptions`, Svelte's `updateBody` → `updateForwardedProps`, and `chat({ conversationId })` → `chat({ threadId })`. |

## Running a codemod

You can run any codemod via `npx jscodeshift` directly against a remote URL — no clone or install needed in your project:

```bash
npx jscodeshift \
  --parser=tsx \
  -t https://raw.githubusercontent.com/TanStack/ai/main/codemods/ag-ui-compliance/transform.ts \
  src/**/*.{ts,tsx}
```

Add `--dry --print` to preview the rewrite without modifying files.

## Running locally (this repo)

If you've cloned this repo (e.g., to apply a codemod to the bundled examples), use the top-level pnpm script:

```bash
pnpm codemod:ag-ui-compliance "examples/**/*.{ts,tsx}"
```

## Authoring a new codemod

1. Add a sibling directory `codemods/<your-codemod>/`.
2. Implement the transform in `transform.ts` — follow `ag-ui-compliance/transform.ts` for structure (import-source gating, conflict-safe property renames).
3. Add fixtures under `__testfixtures__/<case>.input.{ts,tsx}` and matching `.output.{ts,tsx}`. Cover at least one positive case per transformation, one negative case (file should be left alone), and one conflict case (legacy + canonical names both present).
4. Add tests in `transform.test.ts` using the `expectFixture` helper.
5. Run `pnpm --filter @tanstack/ai-codemods test`.
6. Document the codemod in its own `README.md` and add a row to the table above.
