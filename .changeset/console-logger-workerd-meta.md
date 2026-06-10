---
'@tanstack/ai': patch
---

Fix the default debug logger dropping `meta` payloads on Cloudflare Workers / workerd (#730). `ConsoleLogger` previously rendered `meta` with `console.dir`, which workerd never forwards to the terminal — debug mode printed category headlines but no request bodies, chunk contents, or `RUN_ERROR` payloads. The logger now detects the runtime: Node keeps the depth-unlimited `console.dir` dump, Cloudflare Workers renders `meta` as circular-safe pretty-printed JSON (workerd's own inspect truncates nested objects), and other runtimes (browsers, Deno, Bun) receive `meta` as an extra console argument so devtools keep collapsible trees. Detection checks workerd's `navigator.userAgent` marker before `process.versions.node`, since `nodejs_compat` emulates a Node version string.
