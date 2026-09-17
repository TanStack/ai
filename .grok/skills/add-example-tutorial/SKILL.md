---
name: add-example-tutorial
description: "Use when adding a public teaching example or a docs tutorial. Don't use for an internal Nx playground (that is new-react-playground), for a package API change with no walkthrough, or for a docs-only copy edit."
---

# Add Example Tutorial

Start from the Nx React app generator. Land at `examples/react/<slug>/`. Then slim the generated lab to the one scenario this tutorial teaches. `examples/react/basic-chat` and `docs/tutorials/basic-chat.md` show a finished public example. Do not copy that app. Use the generator as the starting tree.

Load `docs`, `simple-english`, and `i-have-adhd` before writing tutorial pages. Load `pr-description` before `gh pr create` and after an agent push on an open PR.

## End state

- App at `examples/react/<slug>/` (not `examples/<slug>/`, not `examples/ts-*`).
- `pnpm-workspace.yaml` includes `examples/react/*`.
- Tutorial at `docs/tutorials/<slug>.md` on `"tab": "tutorial"`.
- Examples tab child `framework/react/examples/<slug>` in `docs/config.json`.
- Overview / Quick Start (and any recipe) point at the tutorial.
- GitHub link at the bottom: `https://github.com/TanStack/ai/tree/main/examples/react/<slug>`.
- Live sandbox comment on the tutorial page.
- One PR on this repo.

## 1. Shape the app

1. Pick a kebab-case `slug`.
2. From the repo root: `pnpm nx g @tanstack/workspace-plugin:react-app <slug>`. The files land at `examples/react/<slug>/`.
3. Slim the generated lab to this tutorial. One adapter. Keep `workspace:*` for `@tanstack/ai*` deps. Do not add `@tanstack/ai-client` (framework packages re-export the client and `/byok`).
4. Inline the model id. Read the adapter's current chat model list and pass the latest flagship id as a string literal into the adapter factory. Do not add a model const, a `chat-model.ts`, a `handle-chat-post.ts`, or any other one-off helper for the model or the POST body. The route file owns `chat()`.

Do not commit the unused generator extras (every adapter, PKCE, model picker, thinking UI) unless this tutorial teaches them.

## 2. File layout

Match Basic Chat only for the Start routes folder:

- `src/routes/index.tsx` is the page.
- `src/routes/api.chat.ts` is the server route (next to `index.tsx`). Start maps `api.chat.ts` to `/api/chat`.
- `tsconfig.json` is self-contained (Start-style). Do not extend the repo root.

Add other files only when this tutorial needs them (a key form, a tool, a store). Many examples will not use BYOK. Do not add BYOK files by default.

## 3. Tutorial page

Load `docs`. Run its persona and tone gates unless this conversation already chose them.

Open with the problem the reader has, why it matters, and how this tutorial solves it (one short block). Then walk through steps. Each step teaches one piece of that solution and says why that piece exists.

Typical shape (adapt to the scenario; do not force BYOK):

1. Create a Start app (`npx @tanstack/cli@latest create`) and install with package-manager tabs. React-only line, no `@tanstack/ai-client`: `react: @tanstack/ai @tanstack/ai-react @tanstack/ai-<adapter>`.
2. Client vs server: what each side is for in this scenario.
3. Client pieces, one step each, each with why.
4. Server pieces, one step each, each with why. Put the route at `src/routes/api.chat.ts` and say that.

Put the sandbox comment and the GitHub link on the page (see End state). Do not add a numbered "try it" step that only repeats those.

Sandbox comment:

```html
<!-- ::client-example library=ai framework=react slug=<slug> -->
```

Do not mention Nx, generators, or PRs in the tutorial. Code on the page must match the example files.

Install tabs: `<!-- ::start:tabs variant="package-manager" mode="install" -->`. See the `docs` skill.

## 4. Nav and pointers

`docs/config.json`:

- Tutorials section `"tab": "tutorial"`, child `tutorials/<slug>`.
- Examples section `"tab": "examples"`, child `framework/react/examples/<slug>`.

Point Overview and Quick Start at the tutorial. Cross-link any recipe that covers the same UI.

`examples/README.md`: list the new example.

## PRs

- Do not add tests under the example app.
- Do not commit `docs/superpowers/`, plans, screenshots, or `.agent/`.
- Example-only / docs: no changeset unless a published package changed.
- Conventional commit. No `Co-authored-by`.
- Fill the PR template honestly. Do not tick `test:pr` if it was not run.

## Common mistakes

| Mistake                                          | Fix                                                           |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Copy Basic Chat file-for-file                    | Generate, then slim to this scenario                          |
| Generate under `examples/<slug>`                 | The generator writes `examples/react/<slug>/`                 |
| Model const or extra handler file                | Inline the latest model id in the route                       |
| BYOK files on a tutorial that does not need keys | Skip them                                                     |
| Tutorial is only commands and code               | Problem, why, how, then each step as one piece                |
| Skip nav or the sandbox comment                  | Add the Examples tab child and the `::client-example` comment |
| `tsconfig.json` extends `../../../tsconfig.json` | Keep a self-contained Start-style tsconfig in the example     |
