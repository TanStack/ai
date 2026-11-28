# @tanstack/ai-uthana

## 0.2.0

### Minor Changes

- [#2217](https://github.com/TanStack/ai/pull/2217) [`a686f36`](https://github.com/TanStack/ai/commit/a686f360090bec30263ec194742b11333b4d9621) - Rename the experimental 3D model and motion APIs. Every name now writes `3d` in lower case, and the motion functions have a `3d` prefix. The options and results do not change. Update your imports and calls.
  - `generate3DModel()` is now `generate3dModel()`. `get3DModelJobStatus()` and `create3DModelOptions()` change the same way. In an agent, `ctx.generate3DModel` is now `ctx.generate3dModel`.
  - `generateMotion()` is now `generate3dMotion()`. `getMotionJobStatus()`, `cancelMotionJob()` and `createMotionOptions()` are now `get3dMotionJobStatus()`, `cancel3dMotionJob()` and `create3dMotionOptions()`.
  - The types `Model3D*` are now `Model3d*`, for example `Model3dResult` and `Model3dAdapter`. `Model3DGenerateInput` in `@tanstack/ai-client` is now `Model3dGenerateInput`.
  - The adapters `fal3DModel()`, `meshy3DModel()`, `falMotion()`, `meshyMotion()` and `uthanaMotion()` are now `fal3dModel()`, `meshy3dModel()`, `fal3dMotion()`, `meshy3dMotion()` and `uthana3dMotion()`.
  - The hooks `useGenerate3DModel`, `createGenerate3DModel` and `injectGenerate3DModel` are now `useGenerate3dModel`, `createGenerate3dModel` and `injectGenerate3dModel`.
  - A custom adapter renames its methods: `create3DModelJob`, `get3DModelStatus`, `get3DModel` and `cancel3DModelJob` take `3d`, and `createMotionJob`, `getMotionStatus`, `getMotion` and `cancelMotionJob` become `create3dMotionJob`, `get3dMotionStatus`, `get3dMotion` and `cancel3dMotionJob`.
  - The motion types `Motion*` are now `Motion3d*`, for example `Motion3dAdapter`, `BaseMotion3dAdapter`, `Motion3dGenerationResult` and `FalMotion3dAdapter`.
  - The motion adapter `kind` is now `'motion3d'`. Pass `'motion3d'` to `generationParamsFromRequest()`.
  - The motion events are now `motion3d:*`, for example `motion3d:status` and `motion3d:request:started`. `MOTION_EVENTS` is now `MOTION3D_EVENTS`.

### Patch Changes

- Updated dependencies [[`92e8799`](https://github.com/TanStack/ai/commit/92e8799d48bb80106234df5d700674f318c56bef), [`e5bb4d5`](https://github.com/TanStack/ai/commit/e5bb4d5e666663664321ea2d3c6cf06176c3d942), [`f25954a`](https://github.com/TanStack/ai/commit/f25954a2867ceacaad11c0a5995ba742e2201934), [`a686f36`](https://github.com/TanStack/ai/commit/a686f360090bec30263ec194742b11333b4d9621), [`c695ada`](https://github.com/TanStack/ai/commit/c695ada5091e7022bf13b235220645ceb65d43b0)]:
  - @tanstack/ai@1.9.0

## 0.1.0

### Minor Changes

- [#2194](https://github.com/TanStack/ai/pull/2194) [`0a84ac2`](https://github.com/TanStack/ai/commit/0a84ac22cbd29ac49997091713ca9da81bb3e553) - Add `@tanstack/ai-uthana`, an Uthana adapter for experimental motion generation. `uthanaMotion()` runs Uthana text-to-motion 3.0 jobs and returns FBX or GLB files on the chosen character, as `data:` URLs because Uthana serves files only with your key. `createUthanaCharacter()` uploads and auto-rigs your own humanoid model so motions come out on its proportions. Uthana has no cancel API, so the adapter has no remote cancel.

### Patch Changes

- Updated dependencies [[`1aa7227`](https://github.com/TanStack/ai/commit/1aa722707deca4d567efafe0830471222d558b62), [`0a84ac2`](https://github.com/TanStack/ai/commit/0a84ac22cbd29ac49997091713ca9da81bb3e553), [`4288b7a`](https://github.com/TanStack/ai/commit/4288b7aaa80e085df899e2bebb597a9f85d6fb71)]:
  - @tanstack/ai@1.7.0
