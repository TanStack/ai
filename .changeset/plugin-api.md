---
'@tanstack/ai': minor
'@tanstack/ai-plugin-toolkit': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

Add definePlugin (server) and usePlugin/createPlugin (client): declare app-defined plugins — chatPlugin for conversational surfaces, generationPlugin for one-shot work with schema-validated inputs, plus media factories (imagePlugin, videoPlugin, etc.) — behind one endpoint and drive them from one fully typed client hook. Server-side composition is coming via a future workflowPlugin.

The plugin authoring API now lives in the new `@tanstack/ai-plugin-toolkit` package — `definePlugin`, `chatPlugin`, `generationPlugin`, the media factories, and the plugin types all move there; the `@tanstack/ai/plugin` subpath is removed. Every plugin also gets a direct `.run()`, sibling to `.handler`: it executes the plugin in-process and resolves with the typed result (generation → the result; chat → `{ text, structured }`), with no HTTP request or streaming response involved. `.run()` accepts raw input, an HTTP `Request`, or an already-parsed request body.
