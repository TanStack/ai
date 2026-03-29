# @tanstack/ai-devtools-core

## 0.3.14

### Patch Changes

- Updated dependencies [[`b8cc69e`](https://github.com/TanStack/ai/commit/b8cc69e15eda49ce68cc48848284b0d74a55a97c)]:
  - @tanstack/ai@0.9.1
  - @tanstack/ai-event-client@0.1.3

## 0.3.13

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0
  - @tanstack/ai-event-client@0.1.2

## 0.3.12

### Patch Changes

- Updated dependencies [[`64b9cba`](https://github.com/TanStack/ai/commit/64b9cba2ebf89162b809ba575c49ef12c0e87ee7), [`dc53e1b`](https://github.com/TanStack/ai/commit/dc53e1b89fddf6fc744e4788731e8ca64ec3d250)]:
  - @tanstack/ai@0.8.1
  - @tanstack/ai-event-client@0.1.1

## 0.3.11

### Patch Changes

- feat: add middleware system and content guard middleware ([#367](https://github.com/TanStack/ai/pull/367))
  - **@tanstack/ai**: New `@tanstack/ai/middlewares` subpath with composable chat middleware architecture. Includes `contentGuardMiddleware` (delta and buffered strategies) and `toolCacheMiddleware`. Middleware hooks: `onStart`, `onIteration`, `onChunk`, `onToolPhaseComplete`, `onFinish`.
  - **@tanstack/ai-event-client**: Initial release. Extracted `devtoolsMiddleware` from `@tanstack/ai` core into a standalone package for tree-shaking. Emits all DevTools events as an observation-only middleware.
  - **@tanstack/ai-client**: Updated event types for middleware integration.
  - **@tanstack/ai-devtools**: Updated iteration timeline and conversation UI for middleware-aware event handling.

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0
  - @tanstack/ai-event-client@0.1.0

## 0.3.10

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0
  - @tanstack/ai-event-client@0.0.2

## 0.3.9

### Patch Changes

- Updated dependencies [[`6dfffca`](https://github.com/TanStack/ai/commit/6dfffca99aeac1ada59eb288f8eb09e564d3db1e)]:
  - @tanstack/ai@0.6.3

## 0.3.8

### Patch Changes

- Updated dependencies [[`2ee0b33`](https://github.com/TanStack/ai/commit/2ee0b33386c1f1604c04c1f2f78a859f8a83fd2d)]:
  - @tanstack/ai@0.6.2

## 0.3.7

### Patch Changes

- fix solid bundling of devtools ([#334](https://github.com/TanStack/ai/pull/334))

- Bump up package versions ([#334](https://github.com/TanStack/ai/pull/334))

## 0.3.6

### Patch Changes

- Updated dependencies [[`d8678e2`](https://github.com/TanStack/ai/commit/d8678e254a8edfa4f95eeb059aa30083c18f52f8)]:
  - @tanstack/ai@0.6.1

## 0.3.5

### Patch Changes

- Updated dependencies [[`5aa6acc`](https://github.com/TanStack/ai/commit/5aa6acc1a4faea5346f750322e80984abf2d7059), [`1f800aa`](https://github.com/TanStack/ai/commit/1f800aacf57081f37a075bc8d08ff397cb33cbe9)]:
  - @tanstack/ai@0.6.0

## 0.3.4

### Patch Changes

- Updated dependencies [[`58702bc`](https://github.com/TanStack/ai/commit/58702bcaad31c46f8fd747b2f0e1daff2003beb9)]:
  - @tanstack/ai@0.5.1

## 0.3.3

### Patch Changes

- Updated dependencies [[`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd), [`5d98472`](https://github.com/TanStack/ai/commit/5d984722e1f84725e3cfda834fbda3d0341ecedd)]:
  - @tanstack/ai@0.5.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`6f886e9`](https://github.com/TanStack/ai/commit/6f886e96f2478374520998395357fdf3aa9149ab)]:
  - @tanstack/ai@0.4.2

## 0.3.1

### Patch Changes

- Updated dependencies [[`6e1bb50`](https://github.com/TanStack/ai/commit/6e1bb5097178a6ad795273ca715f1e09d3f5a006)]:
  - @tanstack/ai@0.4.1

## 0.3.0

### Minor Changes

- add multiple modalities support to the client ([#263](https://github.com/TanStack/ai/pull/263))

### Patch Changes

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai@0.4.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`230bab6`](https://github.com/TanStack/ai/commit/230bab6417c8ff2c25586a12126c85e27dd7bc15)]:
  - @tanstack/ai@0.3.1

## 0.2.2

### Patch Changes

- Updated dependencies [[`e52135f`](https://github.com/TanStack/ai/commit/e52135f6ec3285227679411636e208ae84a408d7)]:
  - @tanstack/ai@0.3.0

## 0.2.1

### Patch Changes

- Fix issue with double mounting of devtools ([#123](https://github.com/TanStack/ai/pull/123))

## 0.2.0

### Minor Changes

- Bump tanstack-devtools to 0.2.3 ([#204](https://github.com/TanStack/ai/pull/204))

### Patch Changes

- Updated dependencies [[`7573619`](https://github.com/TanStack/ai/commit/7573619a234d1a50bd2ac098d64524447ebc5869)]:
  - @tanstack/ai@0.2.2

## 0.1.2

### Patch Changes

- fix up readmes ([#188](https://github.com/TanStack/ai/pull/188))

- Updated dependencies [[`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9), [`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9)]:
  - @tanstack/ai@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai@0.2.0

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai@0.1.0

## 0.0.3

### Patch Changes

- update event client ([#128](https://github.com/TanStack/ai/pull/128))

- Updated dependencies [[`52c3172`](https://github.com/TanStack/ai/commit/52c317244294a75b0c7f5e6cafc8583fbb6abfb7)]:
  - @tanstack/ai@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [[`64fda55`](https://github.com/TanStack/ai/commit/64fda55f839062bc67b8c24850123e879fdbf0b3)]:
  - @tanstack/ai@0.0.2

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))

- Updated dependencies [[`a9b54c2`](https://github.com/TanStack/ai/commit/a9b54c21282d16036a427761e0784b159a6f2d99)]:
  - @tanstack/ai@0.0.1
