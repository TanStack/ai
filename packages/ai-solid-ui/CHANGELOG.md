# @tanstack/ai-solid-ui

## 0.7.2

### Patch Changes

- Updated dependencies [[`ad23da9`](https://github.com/TanStack/ai/commit/ad23da92c279759b3778672dcee3d1616a02994b)]:
  - @tanstack/ai-client@0.12.0
  - @tanstack/ai-solid@0.10.9

## 0.7.1

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-client@0.11.6
  - @tanstack/ai-solid@0.10.6

## 0.7.0

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

- Updated dependencies [[`a03d12b`](https://github.com/TanStack/ai/commit/a03d12b13ade93f3e262c6ffa996696ce27472ef)]:
  - @tanstack/ai-client@0.11.4
  - @tanstack/ai-solid@0.10.4

## 0.6.7

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
  - @tanstack/ai-solid@0.10.3

## 0.6.6

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai-client@0.11.0
  - @tanstack/ai-solid@0.10.0

## 0.6.5

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099)]:
  - @tanstack/ai-client@0.10.0
  - @tanstack/ai-solid@0.9.0

## 0.6.4

### Patch Changes

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec)]:
  - @tanstack/ai-solid@0.8.0
  - @tanstack/ai-client@0.9.2

## 0.6.3

### Patch Changes

- Updated dependencies [[`b2d3cc1`](https://github.com/TanStack/ai/commit/b2d3cc131a31c54bd1e5841f958fbe333514e508), [`13cceae`](https://github.com/TanStack/ai/commit/13cceaedf64e398ca15b8dbbbfe215329ea26794)]:
  - @tanstack/ai-client@0.9.0
  - @tanstack/ai-solid@0.7.1

## 0.6.2

### Patch Changes

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`008f015`](https://github.com/TanStack/ai/commit/008f0154f852e7e6734d3e3d35cad47780b52b7a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1)]:
  - @tanstack/ai-client@0.8.0
  - @tanstack/ai-solid@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai-client@0.7.0
  - @tanstack/ai-solid@0.6.5

## 0.6.0

### Patch Changes

- Updated dependencies [[`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e), [`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e)]:
  - @tanstack/ai-client@0.6.0
  - @tanstack/ai-solid@0.6.4

## 0.5.0

### Patch Changes

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059), [`1f800aa`](https://github.com/TanStack/ai/commit/1f800aacf57081f37a075bc8d08ff397cb33cbe9)]:
  - @tanstack/ai-client@0.5.0
  - @tanstack/ai-solid@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd)]:
  - @tanstack/ai-client@0.4.4
  - @tanstack/ai-solid@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai-solid@0.5.0
  - @tanstack/ai-client@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [[`99ccee5`](https://github.com/TanStack/ai/commit/99ccee5c72df12adc13bede98142c6da84d13cc4), [`230bab6`](https://github.com/TanStack/ai/commit/230bab6417c8ff2c25586a12126c85e27dd7bc15)]:
  - @tanstack/ai-client@0.4.0
  - @tanstack/ai-solid@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`e52135f`](https://github.com/TanStack/ai/commit/e52135f6ec3285227679411636e208ae84a408d7)]:
  - @tanstack/ai-client@0.3.0
  - @tanstack/ai-solid@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9), [`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9)]:
  - @tanstack/ai-solid@0.2.1
  - @tanstack/ai-client@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai-client@0.2.0
  - @tanstack/ai-solid@0.2.0

## 0.1.0

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai-client@0.1.0
  - @tanstack/ai-solid@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-client@0.0.3
  - @tanstack/ai-solid@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [[`a7bd563`](https://github.com/TanStack/ai/commit/a7bd5639eb2fbf1b4169eb307f77149f4a85a915)]:
  - @tanstack/ai-client@0.0.2
  - @tanstack/ai-solid@0.0.2

## 0.0.1

### Patch Changes

- initial release of AI ([#76](https://github.com/TanStack/ai/pull/76))

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))

- Updated dependencies [[`a9b54c2`](https://github.com/TanStack/ai/commit/a9b54c21282d16036a427761e0784b159a6f2d99)]:
  - @tanstack/ai-client@0.0.1
  - @tanstack/ai-solid@0.0.1
