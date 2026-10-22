# @tanstack/ai-isolate-node

## 1.0.0

### Major Changes

- [#1840](https://github.com/TanStack/ai/pull/1840) [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e) - TanStack AI 1.0.0. This release removes every API that was deprecated in 0.x. Read the upgrade guide before you upgrade: https://tanstack.com/ai/latest/docs/migration/v1
  - Removed all `@deprecated` exports, options, fields, and type aliases. Each one has a replacement that already shipped in 0.x.
  - Removed `addToolApprovalResponse()` from `ChatClient` and every chat hook. Resolve the bound `tool-approval` interrupt with `resolveInterrupt` instead. The devtools event `tools:approval:responded` is also removed.
  - Removed the old wire formats: the CUSTOM `approval-requested` and `tool-input-available` events, the `[DONE]` SSE line, the `data` copy of `forwardedProps`, pre-binding interrupt descriptors and their `approval_required` and `client_tool_input` reasons, and the STEP events that adapters sent next to `REASONING_*` events. Use a 1.0 client with a 1.0 server.
  - Removed the `toolName` alias from `TOOL_CALL_START` chunks. Read `toolCallName` instead.
  - `threadId` is now required on `useChat` and every other chat hook, `ChatClient`, the generation hooks and clients, `chat()`, `summarize()`, the generation functions, `codeModeWithSnippets()`, `selectRelevantSnippets()`, `CompactionContext`, and `SummarizeInput`. TanStack AI no longer makes a thread id for you. Pass a stable id for each conversation. `createChatHook` factory options no longer take `threadId`: pass it on each hook call. Octane generation hooks take `threadId` instead of `id`. `@tanstack/ai-sandbox` removes `resolveDurableThreadId` and `DurableThreadIdRequiredError`.
  - The published `@tanstack/ai-octane/ui` types are now strict. `UI.Messages`, `UI.Message`, `UI.Part`, and `UI.Interrupts` type their render children. `ToolProps` types `part.input` and `part.output` for the named tool. `toolsComponents` and `interruptsComponents` are required when the chat options declare tools or named interrupts. Code that relied on the old loose types can fail to compile.
  - A connection adapter's `connect()` and `send()` need the run context (with `threadId`) as their fourth argument. `ChatClient` and the generation clients pass it.
  - `@tanstack/ai-sandbox`: `createToolBridgeCore()`, `startHostToolBridge()`, a `ToolBridgeProvisioner`, and `executeHostTool()` take a required `threadId`. Bridged tools get it in their context.
  - `@tanstack/ai-sandbox`: the harness tool bridge and `executeHostTool()` refuse a tool with `needsApproval`. Before, the tool ran with no approval. Remove `needsApproval`, or run the tool with an HTTP adapter.
  - `stream()` and `rpcStream()` pass the AG-UI `RunAgentInput` for the run as the fourth factory argument, the same body the HTTP adapters send. Read it on the server with `chatParamsFromRequestBody()` or `generationParamsFromBody()`, so `threadId`, `runId`, and interrupt `resume` reach a server function. `RunAgentInput` is exported from `@tanstack/ai/client`.
  - A generation `fetcher` gets `threadId` and `runId` in its second argument, next to `signal` and `headers`. Pass them to the server generation call.
  - `generationParamsFromBody()` and `generationParamsFromRequest()` read the generation input from `forwardedProps`. A server that reads `body.data` gets `undefined`. Read `body.forwardedProps` instead. They also require `threadId` and `runId` and return them as strings, the same as `chatParamsFromRequestBody()` and the AG-UI `RunAgentInput`. A body that holds only the input is rejected.
  - Removed the readers for data saved in old 0.x formats (old Cloudflare run-log records, a bare `UIMessage[]` from client persistence, artifact records without `blobKey`).
  - Removed provider models that are shut down.
  - `@tanstack/ai-react-ui`, `@tanstack/ai-solid-ui`, and `@tanstack/ai-vue-ui` get no 1.0 release. Import from `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, or `@tanstack/ai-vue/ui`.

### Patch Changes

- Updated dependencies [[`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e)]:
  - @tanstack/ai-code-mode@1.0.0

## 0.1.52

### Patch Changes

- Updated dependencies [[`80ae825`](https://github.com/TanStack/ai/commit/80ae825b0f226d65312e2986aeb2e7d94e5b2def)]:
  - @tanstack/ai-code-mode@0.5.0

## 0.1.51

### Patch Changes

- Updated dependencies [[`0fb8263`](https://github.com/TanStack/ai/commit/0fb826321c9ba7bd5d8ba0062be2a00b6178726d)]:
  - @tanstack/ai-code-mode@0.4.0

## 0.1.50

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

## 0.1.49

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.3.10

## 0.1.48

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.3.9

## 0.1.47

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.3.8

## 0.1.46

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.3.7

## 0.1.45

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.3.6

## 0.1.44

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.3.5

## 0.1.43

### Patch Changes

- Updated dependencies [[`8f8be19`](https://github.com/TanStack/ai/commit/8f8be1983bdb0f29d26b1961a52a1b810b47866c)]:
  - @tanstack/ai-code-mode@0.3.4

## 0.1.42

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.3.3

## 0.1.41

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.3.2

## 0.1.40

### Patch Changes

- [#844](https://github.com/TanStack/ai/pull/844) [`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff) - Republish all packages with their compiled `dist/` output.

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

- Updated dependencies [[`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff)]:
  - @tanstack/ai-code-mode@0.3.1

## 0.1.39

### Patch Changes

- Updated dependencies [[`fbd3762`](https://github.com/TanStack/ai/commit/fbd37623b287e370aa5678e161dec19cf13ae33b)]:
  - @tanstack/ai-code-mode@0.3.0

## 0.1.38

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.13

## 0.1.37

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.12

## 0.1.36

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.11

## 0.1.35

### Patch Changes

- Updated dependencies [[`81e3aee`](https://github.com/TanStack/ai/commit/81e3aee318d0e6f869ee00c3d86a7475980d89df), [`3bf0dbf`](https://github.com/TanStack/ai/commit/3bf0dbfb3e0a3c252b4769855ba82ffb8cdd69ca)]:
  - @tanstack/ai-code-mode@0.2.10

## 0.1.34

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.9

## 0.1.33

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.8

## 0.1.32

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai-code-mode@0.2.7

## 0.1.31

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.6

## 0.1.30

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.5

## 0.1.29

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.4

## 0.1.28

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.3

## 0.1.27

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.2

## 0.1.26

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.1

## 0.1.25

### Patch Changes

- Updated dependencies [[`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai-code-mode@0.2.0

## 0.1.24

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.24

## 0.1.23

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.23

## 0.1.22

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.22

## 0.1.21

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.21

## 0.1.20

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.20

## 0.1.19

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-code-mode@0.1.19

## 0.1.18

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.18

## 0.1.17

### Patch Changes

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529)]:
  - @tanstack/ai-code-mode@0.1.17

## 0.1.16

### Patch Changes

- Tighten TypeScript safety: enable `noImplicitOverride`, ([#579](https://github.com/TanStack/ai/pull/579))
  `noFallthroughCasesInSwitch`, and `useDefineForClassFields` in the
  root `tsconfig.json`; add a typed-ESLint block scoped to
  `packages/*/src/**` that turns on `no-floating-promises`,
  `no-misused-promises`, `await-thenable`,
  `switch-exhaustiveness-check`, `consistent-type-exports`,
  `prefer-readonly`, and `no-non-null-assertion` (errors), plus
  `no-explicit-any` (warning). `@ts-ignore` and `@ts-nocheck` are
  disallowed in library source via `@typescript-eslint/ban-ts-comment`,
  and `as unknown as <T>` double-casts are blocked by a
  `no-restricted-syntax` rule (escape hatches available with an inline
  reason). Two flags from the original five-flag set —
  `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes`
  — were tried and rolled back: they produced ~500 lines of bracket-
  access and conditional-spread churn without catching any real bugs,
  and `exactOptionalPropertyTypes` would have forced consumers using
  it themselves to deal with our internals' style preferences.

  User-visible API surface is unchanged; this is a hardening pass to
  keep streaming/agent-loop correctness and discriminated-union
  exhaustiveness honest going forward. See issue #564.

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai-code-mode@0.1.16

## 0.1.15

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.15

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`1d1c58f`](https://github.com/TanStack/ai/commit/1d1c58f33188ff98893edb626efd66ac73b8eadb)]:
  - @tanstack/ai-code-mode@0.1.1

## 0.1.0

### Minor Changes

- Add code mode and isolate packages for secure AI code execution ([#362](https://github.com/TanStack/ai/pull/362))

  Also includes fixes for Ollama tool call argument streaming and usage
  reporting, OpenAI realtime adapter handling of missing call_id/item_id,
  realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
  type export from ai-event-client.

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai-code-mode@0.1.0
