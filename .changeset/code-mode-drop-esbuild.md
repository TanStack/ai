---
'@tanstack/ai-code-mode': patch
---

fix(code-mode): drop esbuild for edge-safe TypeScript stripping

`@tanstack/ai-code-mode` hard-depended on `esbuild` to strip TypeScript before sandbox execution. esbuild ships a Node-native binary and pulls in Node-only built-ins (e.g. `require("pnpapi")`), which broke browser bundles and edge runtimes such as Cloudflare Workers/Pages. The default transpiler is now `sucrase`, a pure-JavaScript transform that is safe to bundle for browsers and edge runtimes.

sucrase is a type-stripper rather than a down-leveler, so unlike esbuild it does not compile a few exotic constructs: TypeScript value `namespace` blocks are dropped, decorators / the `accessor` keyword pass through un-lowered, and post-ES2022 syntax (`using`, RegExp `/v`·`/d` flags) is left as-is (fine on modern V8/Node sandboxes, but may fail on older engines like QuickJS). A new `transpile` escape hatch on `createCodeModeTool` lets you swap in a heavier Node-only transpiler (e.g. esbuild) when you need that coverage and don't need edge safety.
