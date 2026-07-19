# @tanstack/ai-vue-ui

## 0.2.33

### Patch Changes

- Updated dependencies [[`35946e3`](https://github.com/TanStack/ai/commit/35946e3c39fb123c133ebe662f8e2cf0139f2b8c)]:
  - @tanstack/ai-vue@0.15.0

## 0.2.32

### Patch Changes

- Updated dependencies [[`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589)]:
  - @tanstack/ai-vue@0.14.4

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.14.3

## 0.2.30

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.14.2

## 0.2.29

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.14.1

## 0.2.28

### Patch Changes

- Updated dependencies [[`33acdd4`](https://github.com/TanStack/ai/commit/33acdd4df4aef13d594700d9b52087252091bd40), [`c22c663`](https://github.com/TanStack/ai/commit/c22c6632fdca761033cb9c4273bf61fc8ce86662)]:
  - @tanstack/ai-vue@0.14.0

## 0.2.27

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
  - @tanstack/ai-vue@0.13.15

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.14

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.13

## 0.2.24

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.12

## 0.2.23

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.11

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.10

## 0.2.21

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.9

## 0.2.20

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.8

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.7

## 0.2.18

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai-vue@0.13.6

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.5

## 0.2.16

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.4

## 0.2.15

### Patch Changes

- Updated dependencies [[`d5cb4b9`](https://github.com/TanStack/ai/commit/d5cb4b9445c5b97b06a7fc224dd2c3a92f0e802a)]:
  - @tanstack/ai-vue@0.13.3

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.2

## 0.2.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.13.1

## 0.2.12

### Patch Changes

- Updated dependencies [[`755e995`](https://github.com/TanStack/ai/commit/755e9953a31e879c4b88df0e7672ce1224886c97)]:
  - @tanstack/ai-vue@0.13.0

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.12.2

## 0.2.10

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.12.1

## 0.2.9

### Patch Changes

- Updated dependencies [[`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai-vue@0.12.0

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.11.1

## 0.2.7

### Patch Changes

- Updated dependencies [[`d5645cf`](https://github.com/TanStack/ai/commit/d5645cfd4d1b9cfc877f7d4d714517e166a99ce3)]:
  - @tanstack/ai-vue@0.11.0

## 0.2.6

### Patch Changes

- Updated dependencies [[`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855)]:
  - @tanstack/ai-vue@0.10.11

## 0.2.5

### Patch Changes

- Updated dependencies [[`ad23da9`](https://github.com/TanStack/ai/commit/ad23da92c279759b3778672dcee3d1616a02994b)]:
  - @tanstack/ai-vue@0.10.10

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.10.9

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.10.8

## 0.2.2

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-vue@0.10.7

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.10.6

## 0.2.0

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
  - @tanstack/ai-vue@0.10.5

## 0.1.40

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
  - @tanstack/ai-vue@0.10.4

## 0.1.39

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.10.3

## 0.1.38

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.10.2

## 0.1.37

### Patch Changes

- Updated dependencies [[`88fe80c`](https://github.com/TanStack/ai/commit/88fe80c404a218bf3e3a1ed5853a14f61248ed14)]:
  - @tanstack/ai-vue@0.10.1

## 0.1.36

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai-vue@0.10.0

## 0.1.35

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099)]:
  - @tanstack/ai-vue@0.9.0

## 0.1.34

### Patch Changes

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec)]:
  - @tanstack/ai-vue@0.8.0

## 0.1.33

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.7.2

## 0.1.32

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.7.1

## 0.1.31

### Patch Changes

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1)]:
  - @tanstack/ai-vue@0.7.0

## 0.1.30

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.19

## 0.1.29

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.18

## 0.1.28

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.17

## 0.1.27

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.16

## 0.1.26

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.15

## 0.1.25

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.14

## 0.1.24

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.13

## 0.1.23

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.12

## 0.1.22

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.11

## 0.1.21

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.10

## 0.1.20

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.9

## 0.1.19

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.8

## 0.1.18

### Patch Changes

- Updated dependencies [[`64b9cba`](https://github.com/TanStack/ai/commit/64b9cba2ebf89162b809ba575c49ef12c0e87ee7), [`dc53e1b`](https://github.com/TanStack/ai/commit/dc53e1b89fddf6fc744e4788731e8ca64ec3d250)]:
  - @tanstack/ai-vue@0.6.7

## 0.1.17

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.6

## 0.1.16

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.5

## 0.1.15

### Patch Changes

- Updated dependencies [[`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e)]:
  - @tanstack/ai-vue@0.6.4

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.3

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.2

## 0.1.12

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.6.1

## 0.1.11

### Patch Changes

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059)]:
  - @tanstack/ai-vue@0.6.0

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.5.4

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.5.3

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.5.2

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.5.1

## 0.1.6

### Patch Changes

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai-vue@0.5.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`99ccee5`](https://github.com/TanStack/ai/commit/99ccee5c72df12adc13bede98142c6da84d13cc4)]:
  - @tanstack/ai-vue@0.4.0

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.2.2

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-vue@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai-vue@0.2.0

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai-client@0.1.0
  - @tanstack/ai-vue@0.1.0

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-client@0.0.3
  - @tanstack/ai-vue@0.0.2
