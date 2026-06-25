---
'@tanstack/ai': minor
'@tanstack/ai-angular': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-client': patch
'@tanstack/ai-code-mode': patch
'@tanstack/ai-code-mode-skills': patch
'@tanstack/ai-devtools-core': patch
'@tanstack/ai-elevenlabs': patch
'@tanstack/ai-event-client': patch
'@tanstack/ai-fal': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
'@tanstack/ai-isolate-cloudflare': patch
'@tanstack/ai-isolate-node': patch
'@tanstack/ai-isolate-quickjs': patch
'@tanstack/ai-mcp': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-preact': patch
'@tanstack/ai-react': patch
'@tanstack/ai-react-ui': patch
'@tanstack/ai-solid': patch
'@tanstack/ai-solid-ui': patch
'@tanstack/ai-svelte': patch
'@tanstack/ai-utils': patch
'@tanstack/ai-vue': patch
'@tanstack/ai-vue-ui': patch
'@tanstack/openai-base': patch
'@tanstack/preact-ai-devtools': patch
'@tanstack/react-ai-devtools': patch
'@tanstack/solid-ai-devtools': patch
---

Republish all packages with their compiled `dist/` output.

Releases `0.33.0`–`0.36.0` were published without a `dist/` directory: the
release workflow relied on an Nx-cached `build` whose outputs were not
materialized to disk before `changeset publish` packed the tarballs, and
`files: ["dist"]` silently includes nothing when `dist/` is absent. The
published packages therefore contained only `src/`, so every export
(`./dist/esm/*.js`) resolved to a missing file and the packages were
uninstallable.

The publish step now runs a fresh, cache-bypassing build of all packages
immediately before publishing, guaranteeing compiled artifacts are present in
every tarball.
