---
'@tanstack/ai-code-mode': minor
---

Add a `debug` option to `createCodeMode` / `createCodeModeTool`. Failed executions and secret-parameter warnings now go through the `@tanstack/ai` debug logger instead of hard-coded `console.error` / `console.warn`, so `debug: { logger }` routes them to your own `Logger` and `debug: false` silences them. Errors still reach the console by default. The success line previously behind `CODE_MODE_DEBUG=1` now logs under the `tools` category.
