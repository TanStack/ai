# @tanstack/ai-remix

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
