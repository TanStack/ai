---
'@tanstack/ai': patch
'@tanstack/ai-angular': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-byteplus': patch
'@tanstack/ai-client': patch
'@tanstack/ai-code-mode': patch
'@tanstack/ai-code-mode-skills': patch
'@tanstack/ai-devtools-core': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-fal': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-isolate-cloudflare': patch
'@tanstack/ai-isolate-daytona': patch
'@tanstack/ai-isolate-node': patch
'@tanstack/ai-isolate-quickjs': patch
'@tanstack/ai-isolate-quickjs-bun': patch
'@tanstack/ai-mcp': patch
'@tanstack/ai-memory': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-persistence': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-react': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-vue-ui': patch
'@tanstack/openai-base': patch
'@tanstack/preact-ai-devtools': patch
'@tanstack/react-ai-devtools': patch
'@tanstack/solid-ai-devtools': patch
---

fix: publish internal dependency ranges as `^x.y.z` instead of exact pins

Internal dependencies on other TanStack AI packages used `workspace:*` in
`dependencies` and `peerDependencies`. pnpm rewrites that to an **exact** version
at publish time, so a released package asked for e.g. `@tanstack/ai-utils@0.4.0`
rather than `^0.4.0`.

Two consequences for consumers:

- **Duplicate copies.** An exact pin cannot dedupe. Installing a newer
  `@tanstack/ai` alongside a package pinned to the previous patch produced two
  copies in the tree, which breaks `instanceof` checks and module-level state,
  and inflates bundles.
- **Unsatisfiable peers.** An exactly pinned `peerDependency` conflicts the
  moment the internal package ships its next patch, forcing consumers into
  overrides or `--legacy-peer-deps`.

These fields now use `workspace:^`, which publishes as `^x.y.z`. Every package
here is still `0.x`, so `^0.43.1` resolves to `0.43.x` only — patches dedupe
cleanly and no breaking minor is ever pulled in.

`devDependencies` deliberately keep `workspace:*`: they are never published, and
`*` correctly means "always build against the local copy".
