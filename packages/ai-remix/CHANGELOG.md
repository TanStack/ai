# @tanstack/ai-remix

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
