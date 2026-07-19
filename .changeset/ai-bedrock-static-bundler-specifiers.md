---
"@tanstack/ai-bedrock": patch
---

Use string-literal specifiers for the AWS SDK dynamic imports in
`@tanstack/ai-bedrock` so static bundlers — esbuild, bun build, Rollup — can
resolve them. Previously the adapter loaded `@aws-sdk/client-bedrock-runtime`
and `@aws-sdk/credential-providers` through `import(/* @vite-ignore */ mod)`
where `mod` was a variable; static analysers cannot resolve a non-literal
specifier, so the SDK was left external and runtime resolution failed in
`node_modules`-free server bundles. Switching to `import('@aws-sdk/...')`
keeps the dynamic import (so the Node-only SDK still defers until first use)
while letting bundlers include it in self-contained server artifacts. Adds a
source-level regression test pinning the literal-specifier contract.

Fixes #929.
