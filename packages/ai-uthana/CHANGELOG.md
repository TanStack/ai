# @tanstack/ai-uthana

## 0.1.0

### Minor Changes

- [#2194](https://github.com/TanStack/ai/pull/2194) [`0a84ac2`](https://github.com/TanStack/ai/commit/0a84ac22cbd29ac49997091713ca9da81bb3e553) - Add `@tanstack/ai-uthana`, an Uthana adapter for experimental motion generation. `uthanaMotion()` runs Uthana text-to-motion 3.0 jobs and returns FBX or GLB files on the chosen character, as `data:` URLs because Uthana serves files only with your key. `createUthanaCharacter()` uploads and auto-rigs your own humanoid model so motions come out on its proportions. Uthana has no cancel API, so the adapter has no remote cancel.

### Patch Changes

- Updated dependencies [[`1aa7227`](https://github.com/TanStack/ai/commit/1aa722707deca4d567efafe0830471222d558b62), [`0a84ac2`](https://github.com/TanStack/ai/commit/0a84ac22cbd29ac49997091713ca9da81bb3e553), [`4288b7a`](https://github.com/TanStack/ai/commit/4288b7aaa80e085df899e2bebb597a9f85d6fb71)]:
  - @tanstack/ai@1.7.0
