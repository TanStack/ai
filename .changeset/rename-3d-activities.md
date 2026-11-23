---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-meshy': minor
'@tanstack/ai-uthana': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-remix': minor
'@tanstack/ai-octane': minor
---

Rename the experimental 3D model and motion APIs. Every name now writes `3d` in lower case, and the motion functions have a `3d` prefix. The options and results do not change. Update your imports and calls.

- `generate3DModel()` is now `generate3dModel()`. `get3DModelJobStatus()` and `create3DModelOptions()` change the same way. In an agent, `ctx.generate3DModel` is now `ctx.generate3dModel`.
- `generateMotion()` is now `generate3dMotion()`. `getMotionJobStatus()`, `cancelMotionJob()` and `createMotionOptions()` are now `get3dMotionJobStatus()`, `cancel3dMotionJob()` and `create3dMotionOptions()`.
- The types `Model3D*` are now `Model3d*`, for example `Model3dResult` and `Model3dAdapter`. `Model3DGenerateInput` in `@tanstack/ai-client` is now `Model3dGenerateInput`.
- The adapters `fal3DModel()`, `meshy3DModel()`, `falMotion()`, `meshyMotion()` and `uthanaMotion()` are now `fal3dModel()`, `meshy3dModel()`, `fal3dMotion()`, `meshy3dMotion()` and `uthana3dMotion()`.
- The hooks `useGenerate3DModel`, `createGenerate3DModel` and `injectGenerate3DModel` are now `useGenerate3dModel`, `createGenerate3dModel` and `injectGenerate3dModel`.
- A custom adapter renames its methods: `create3DModelJob`, `get3DModelStatus`, `get3DModel` and `cancel3DModelJob` take `3d`, and `createMotionJob`, `getMotionStatus`, `getMotion` and `cancelMotionJob` become `create3dMotionJob`, `get3dMotionStatus`, `get3dMotion` and `cancel3dMotionJob`.
- The motion types `Motion*` are now `Motion3d*`, for example `Motion3dAdapter`, `BaseMotion3dAdapter`, `Motion3dGenerationResult` and `FalMotion3dAdapter`.
- The motion adapter `kind` is now `'motion3d'`. Pass `'motion3d'` to `generationParamsFromRequest()`.
- The motion events are now `motion3d:*`, for example `motion3d:status` and `motion3d:request:started`. `MOTION_EVENTS` is now `MOTION3D_EVENTS`.
