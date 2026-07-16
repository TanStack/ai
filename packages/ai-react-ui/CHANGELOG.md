# @tanstack/ai-react-ui

## 0.8.14

### Patch Changes

- Updated dependencies [[`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589)]:
  - @tanstack/ai-client@0.21.0
  - @tanstack/ai-react@0.17.0

## 0.8.13

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai-client@0.20.0
  - @tanstack/ai-react@0.16.4

## 0.8.12

### Patch Changes

- Updated dependencies [[`33acdd4`](https://github.com/TanStack/ai/commit/33acdd4df4aef13d594700d9b52087252091bd40), [`c22c663`](https://github.com/TanStack/ai/commit/c22c6632fdca761033cb9c4273bf61fc8ce86662), [`c1a8732`](https://github.com/TanStack/ai/commit/c1a87327b4a3463d37158f32ca90184b5fd092bb)]:
  - @tanstack/ai-client@0.19.0
  - @tanstack/ai-react@0.16.0

## 0.8.11

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
  - @tanstack/ai-client@0.18.6
  - @tanstack/ai-react@0.15.15

## 0.8.10

### Patch Changes

- [#783](https://github.com/TanStack/ai/pull/783) [`0278a90`](https://github.com/TanStack/ai/commit/0278a900e80ab7203124a74c841222b20b1c3bd3) - Fix `ChatMessage` rendering of multimodal tool results. Tool-result content is `string | Array<ContentPart>`, but the renderer previously typed the message part as `any` and passed the raw content straight to React — an array of content-part objects would throw React's "Objects are not valid as a React child". The part is now typed as `UIMessage['parts'][number]`, and array content is flattened to the concatenation of its text parts (non-text parts are skipped) before rendering, both for the built-in renderer and the `toolResultRenderer` prop.

- Updated dependencies [[`540cbf1`](https://github.com/TanStack/ai/commit/540cbf18a2f7d6c07b44f7f4da0ac3873c0d2581)]:
  - @tanstack/ai-client@0.18.3
  - @tanstack/ai-react@0.15.12

## 0.8.9

### Patch Changes

- Updated dependencies [[`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f)]:
  - @tanstack/ai-client@0.18.0
  - @tanstack/ai-react@0.15.9

## 0.8.8

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai-client@0.17.1
  - @tanstack/ai-react@0.15.6

## 0.8.7

### Patch Changes

- Updated dependencies [[`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0)]:
  - @tanstack/ai-client@0.17.0
  - @tanstack/ai-react@0.15.5

## 0.8.6

### Patch Changes

- Updated dependencies [[`755e995`](https://github.com/TanStack/ai/commit/755e9953a31e879c4b88df0e7672ce1224886c97)]:
  - @tanstack/ai-client@0.16.0
  - @tanstack/ai-react@0.15.0

## 0.8.5

### Patch Changes

- Updated dependencies [[`c1ae8b9`](https://github.com/TanStack/ai/commit/c1ae8b94c83d70508975568eb4fc9b45f1af540b), [`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai-client@0.15.0
  - @tanstack/ai-react@0.14.0

## 0.8.4

### Patch Changes

- Updated dependencies [[`d5645cf`](https://github.com/TanStack/ai/commit/d5645cfd4d1b9cfc877f7d4d714517e166a99ce3)]:
  - @tanstack/ai-client@0.14.0
  - @tanstack/ai-react@0.13.0

## 0.8.3

### Patch Changes

- Updated dependencies [[`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855)]:
  - @tanstack/ai-client@0.13.0
  - @tanstack/ai-react@0.12.1

## 0.8.2

### Patch Changes

- Updated dependencies [[`ad23da9`](https://github.com/TanStack/ai/commit/ad23da92c279759b3778672dcee3d1616a02994b)]:
  - @tanstack/ai-client@0.12.0
  - @tanstack/ai-react@0.12.0

## 0.8.1

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-client@0.11.6
  - @tanstack/ai-react@0.11.6

## 0.8.0

### Minor Changes

- `TextPart` now accepts `remarkPlugins`, `rehypePlugins`, and (React/Solid) ([#599](https://github.com/TanStack/ai/pull/599))
  `components` props, plus a `disableDefaultPlugins` escape hatch. User plugins
  merge with the secure defaults — `rehype-sanitize` continues to run last
  unless defaults are disabled.

  This fixes [#164](https://github.com/TanStack/ai/issues/164): bold and
  emphasis in Japanese, Chinese, and Korean text rendered incorrectly because
  of a CommonMark spec defect. Consumers can now drop in
  [`remark-cjk-friendly`](https://www.npmjs.com/package/remark-cjk-friendly)
  with a single prop:

  ```tsx
  import remarkCjkFriendly from 'remark-cjk-friendly'
  ;<TextPart content={content} remarkPlugins={[remarkCjkFriendly]} />
  ```

  Also fixes a latent bug in `@tanstack/ai-react-ui` where `remark-gfm` was
  passed inside the rehype plugin array, silently disabling GFM features
  (tables, strikethrough, task lists) in the React `TextPart`.

  `@tanstack/ai-vue-ui` omits the `components` prop because its underlying
  renderer (`@crazydos/vue-markdown`) does not expose component overrides;
  use that library's slot API for custom rendering.

### Patch Changes

- Adopt `@tanstack/eslint-config@0.4.0` and clean up the local override layer. ([#607](https://github.com/TanStack/ai/pull/607))
  - Bump `@tanstack/eslint-config` from `0.3.3` to `0.4.0`.
  - Drop dead `pnpm/enforce-catalog` and `pnpm/json-enforce-catalog` disables (upstream removed `eslint-plugin-pnpm` in `0.3.1`).
  - Drop the `no-case-declarations: off` override — no current source actually violates it.
  - Drop the `no-shadow: off` override — upstream sets it to `warn`, so it surfaces in editors without blocking CI.
  - Remove ~25 unnecessary type assertions across the publishable packages that the upgraded `typescript-eslint` now catches via `no-unnecessary-type-assertion`. One deliberately defensive cast in `ag-ui-wire.ts` is preserved with an inline opt-out and a reason comment.

  No public-API or runtime-behavior changes.

- Updated dependencies [[`a03d12b`](https://github.com/TanStack/ai/commit/a03d12b13ade93f3e262c6ffa996696ce27472ef)]:
  - @tanstack/ai-client@0.11.4
  - @tanstack/ai-react@0.11.4

## 0.7.2

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

- Updated dependencies []:
  - @tanstack/ai-client@0.11.3
  - @tanstack/ai-react@0.11.3

## 0.7.1

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49), [`b05adb1`](https://github.com/TanStack/ai/commit/b05adb1b9ca756edc926c6b86ee6fae37dd966c0)]:
  - @tanstack/ai-client@0.11.0
  - @tanstack/ai-react@0.11.0

## 0.7.0

### Minor Changes

- **Breaking:** AG-UI client-to-server compliance. ([#511](https://github.com/TanStack/ai/pull/511))

  `@tanstack/ai-client` now POSTs an AG-UI `RunAgentInput` request body and `@tanstack/ai` server endpoints must use the new `chatParamsFromRequestBody` + `mergeAgentTools` helpers. Upgrade both packages together.

  Highlights:
  - **Wire format**: `{threadId, runId, state, messages, tools, context, forwardedProps}` (per AG-UI 0.0.52 `RunAgentInputSchema`) instead of `{messages, data}`.
  - **New server helpers** exported from `@tanstack/ai`: `chatParamsFromRequestBody`, `mergeAgentTools`.
  - **`chat()` accepts `threadId`, `runId`, `parentRunId`** as optional fields for AG-UI run correlation.
  - **`ChatClient` accepts `threadId`** option; auto-generates and persists per session if omitted; fresh `runId` per send.
  - **Client tools auto-advertised** to the server via `RunAgentInput.tools`.
  - **Foreign AG-UI clients** can hit a TanStack server: `developer` collapses to `system`, `reasoning`/`activity` drop.

  See `docs/migration/ag-ui-compliance.md` for full migration steps.

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099)]:
  - @tanstack/ai-client@0.10.0
  - @tanstack/ai-react@0.10.0

## 0.6.4

### Patch Changes

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec)]:
  - @tanstack/ai-react@0.9.0
  - @tanstack/ai-client@0.9.2

## 0.6.3

### Patch Changes

- Updated dependencies [[`b2d3cc1`](https://github.com/TanStack/ai/commit/b2d3cc131a31c54bd1e5841f958fbe333514e508), [`13cceae`](https://github.com/TanStack/ai/commit/13cceaedf64e398ca15b8dbbbfe215329ea26794)]:
  - @tanstack/ai-client@0.9.0
  - @tanstack/ai-react@0.8.1

## 0.6.2

### Patch Changes

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`008f015`](https://github.com/TanStack/ai/commit/008f0154f852e7e6734d3e3d35cad47780b52b7a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1)]:
  - @tanstack/ai-client@0.8.0
  - @tanstack/ai-react@0.8.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai-client@0.7.0
  - @tanstack/ai-react@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [[`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e), [`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e)]:
  - @tanstack/ai-client@0.6.0
  - @tanstack/ai-react@0.6.4

## 0.5.0

### Patch Changes

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059), [`1f800aa`](https://github.com/TanStack/ai/commit/1f800aacf57081f37a075bc8d08ff397cb33cbe9)]:
  - @tanstack/ai-client@0.5.0
  - @tanstack/ai-react@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd)]:
  - @tanstack/ai-client@0.4.4
  - @tanstack/ai-react@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai-react@0.5.0
  - @tanstack/ai-client@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [[`99ccee5`](https://github.com/TanStack/ai/commit/99ccee5c72df12adc13bede98142c6da84d13cc4), [`230bab6`](https://github.com/TanStack/ai/commit/230bab6417c8ff2c25586a12126c85e27dd7bc15)]:
  - @tanstack/ai-client@0.4.0
  - @tanstack/ai-react@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`e52135f`](https://github.com/TanStack/ai/commit/e52135f6ec3285227679411636e208ae84a408d7)]:
  - @tanstack/ai-client@0.3.0
  - @tanstack/ai-react@0.3.0

## 0.2.1

### Patch Changes

- fix up readmes ([#188](https://github.com/TanStack/ai/pull/188))

- Updated dependencies [[`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9)]:
  - @tanstack/ai-react@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai-react@0.2.0

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai-client@0.1.0
  - @tanstack/ai-react@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-client@0.0.3
  - @tanstack/ai-react@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [[`a7bd563`](https://github.com/TanStack/ai/commit/a7bd5639eb2fbf1b4169eb307f77149f4a85a915)]:
  - @tanstack/ai-client@0.0.2
  - @tanstack/ai-react@0.0.2

## 0.0.1

### Patch Changes

- initial release of AI ([#76](https://github.com/TanStack/ai/pull/76))

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))

- Updated dependencies [[`a9b54c2`](https://github.com/TanStack/ai/commit/a9b54c21282d16036a427761e0784b159a6f2d99)]:
  - @tanstack/ai-client@0.0.1
  - @tanstack/ai-react@0.0.1
