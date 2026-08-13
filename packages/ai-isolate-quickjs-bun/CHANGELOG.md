# @tanstack/ai-isolate-quickjs-bun

## 0.1.0

### Minor Changes

- [#750](https://github.com/TanStack/ai/pull/750) [`b2b82e4`](https://github.com/TanStack/ai/commit/b2b82e4f88517c5b5c2d545810729cff7221c99e) - Add `@tanstack/ai-isolate-quickjs-bun`, a Code Mode isolate driver that runs QuickJS natively on the Bun runtime through `bun:ffi` (via [`quickjs-bun`](https://github.com/superpowerdotcom/quickjs-bun)).

  It implements the same `IsolateDriver` contract as the existing drivers and is a drop-in replacement for `@tanstack/ai-isolate-quickjs` on Bun servers:

  ```typescript
  import { createQuickJSBunIsolateDriver } from '@tanstack/ai-isolate-quickjs-bun'
  import { createCodeModeTool } from '@tanstack/ai-code-mode'

  const executeTypescript = createCodeModeTool({
    driver: createQuickJSBunIsolateDriver(),
    tools: [myTool],
  })
  ```

  Compared to the WASM driver:
  - Native QuickJS through `bun:ffi` — no WebAssembly or asyncify overhead, and no native build step (the QuickJS sources are compiled once per process by Bun's embedded TinyCC).
  - Each context gets a dedicated QuickJS runtime with its own memory and stack limits, so executions on different contexts are not serialized through a shared VM.
  - Same normalized `MemoryLimitError` / `StackOverflowError` / `DisposedError` contract, console capture prefixes, and JSON tool-call protocol as the other drivers, plus a normalized `TimeoutError` for deadline expiry (the WASM driver surfaces timeouts as `InternalError: interrupted`).
  - A configurable `maxToolCalls` limit (default 1000) bounds output and memory growth from untrusted sandbox code.

  The driver requires Bun `>= 1.3.14` and throws an error when used on Node.js.

  It pins `quickjs-bun` to an exact version (`0.1.2`) rather than a range, because that package is still pre-1.0 and compiles QuickJS through TinyCC/`bun:ffi` — its API and platform support may shift between patch releases (see the package README for the compatibility note and the Windows `QUICKJS_BUN_NATIVE_LIBRARY` requirement).

  The `@tanstack/ai-code-mode` README and bundled skill are updated to document the new driver.

### Patch Changes

- [#1071](https://github.com/TanStack/ai/pull/1071) [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e) - fix: publish internal dependency ranges as `^x.y.z` instead of exact pins

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

- Updated dependencies [[`b2b82e4`](https://github.com/TanStack/ai/commit/b2b82e4f88517c5b5c2d545810729cff7221c99e), [`ea9c077`](https://github.com/TanStack/ai/commit/ea9c07724bd6992480238a699fbb18835eab743e)]:
  - @tanstack/ai-code-mode@0.3.11
