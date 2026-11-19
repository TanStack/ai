---
'@tanstack/ai': minor
'@tanstack/ai-fal': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-octane': minor
'@tanstack/ai-remix': minor
---

Add the experimental `generate3DModel()` activity. It turns text, images, or an existing mesh into a 3D model file, and returns the main model URL plus every mesh and texture file. A media prompt can now carry a `model3d` part, so a step such as retexture can take the mesh of an earlier step. `fal3DModel()` in `@tanstack/ai-fal` runs the fal 3D endpoints, and `useGenerate3DModel` (`injectGenerate3DModel` in Angular, `createGenerate3DModel` in Svelte and Remix) streams the job to the UI.
