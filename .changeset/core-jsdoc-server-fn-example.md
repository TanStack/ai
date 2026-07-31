---
'@tanstack/ai': patch
---

Fix `@tanstack/ai` breaking non-React TanStack Start builds.

A JSDoc example on `replayRunStream` inlined a server-function builder chain. Comments survive into `dist`, and Start's server-fn Vite plugin decides whether a module needs compiling by regex-matching the source — so it treated this package as a server-fn module and tried to resolve the framework's `@tanstack/*-start` package, failing the build of any Solid/Vue/Svelte Start app (`could not resolve "@tanstack/solid-start"`). The example now declares the generator separately and no longer trips the match.
