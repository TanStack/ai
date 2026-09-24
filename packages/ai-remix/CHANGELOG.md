# @tanstack/ai-remix

## 0.4.4

### Patch Changes

- Updated dependencies [[`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0)]:
  - @tanstack/ai@0.59.0
  - @tanstack/ai-client@0.34.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0
  - @tanstack/ai-client@0.33.2

## 0.4.2

### Patch Changes

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0
  - @tanstack/ai-client@0.33.1

## 0.4.1

### Patch Changes

- Updated dependencies [[`7c4b25e`](https://github.com/TanStack/ai/commit/7c4b25ebefc64e4f209c282788f515939eca02e9), [`f60f736`](https://github.com/TanStack/ai/commit/f60f73612dd7621e2f1ad76abb1a640307dea3c6)]:
  - @tanstack/ai@0.56.0
  - @tanstack/ai-client@0.33.0

## 0.4.0

### Minor Changes

- [#1408](https://github.com/TanStack/ai/pull/1408) [`62ba217`](https://github.com/TanStack/ai/commit/62ba217d31231fe3ff43ae71b649e047d3a6c1b1) - Re-export the headless client from every framework package, and add a `/byok` subpath so you can import `defineByok` without installing `@tanstack/ai-client`.

### Patch Changes

- Updated dependencies [[`db79c23`](https://github.com/TanStack/ai/commit/db79c23e0591bf42f64e7809d3d50bf6950c2e61), [`3852e16`](https://github.com/TanStack/ai/commit/3852e16158168b911f544f6a23f377fb3db9cd45)]:
  - @tanstack/ai-client@0.32.1

## 0.3.0

### Minor Changes

- [#1400](https://github.com/TanStack/ai/pull/1400) [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410) - Page long chat threads on hydrate. Pass `history: { pageSize }` with `persistence: true`. Then call `loadOlderMessages()` to prepend older turns. `withPersistence` merges incoming messages by id so a short client list keeps stored extras. `loadThread` accepts optional `limit` / `before` and can return a `MessagePage`.

### Patch Changes

- Updated dependencies [[`fa13446`](https://github.com/TanStack/ai/commit/fa13446fab9b9048de9433a5ebf55bc626f5fd74), [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410)]:
  - @tanstack/ai@0.55.0
  - @tanstack/ai-client@0.32.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`8de8242`](https://github.com/TanStack/ai/commit/8de8242beb973cc6b1d1d781c81d922bd296736e), [`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`8689cb5`](https://github.com/TanStack/ai/commit/8689cb5ed7fadfb6ca7208e989422bde9e8c6145), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai-client@0.31.1
  - @tanstack/ai@0.54.0

## 0.2.0

### Minor Changes

- [#1302](https://github.com/TanStack/ai/pull/1302) [`82ced0f`](https://github.com/TanStack/ai/commit/82ced0f5018297e5756828ecc4d312ba78adeaab) - Add the `registerWebMCPTools` registrar to `@tanstack/ai-client`. Each framework package adds a lifecycle wrapper through `useWebMCPTools`, `createWebMCPTools`, or `injectWebMCPTools`.

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871), [`82ced0f`](https://github.com/TanStack/ai/commit/82ced0f5018297e5756828ecc4d312ba78adeaab)]:
  - @tanstack/ai@0.53.0
  - @tanstack/ai-client@0.31.0

## 0.1.0

### Minor Changes

- [#1289](https://github.com/TanStack/ai/pull/1289) [`7fa93de`](https://github.com/TanStack/ai/commit/7fa93dec08dbd9f7457c730e388168fc579b1ac1) - Add `@tanstack/ai-remix` with Remix 3 `createChat` and a typed headless chat UI on `@tanstack/ai-remix/ui`. Call `createChatHook({ options, ...components })` once at module scope, then `createAppChat(handle)` in setup.
