---
'@tanstack/ai': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-fal': minor
---

Add experimental motion generation. `generateMotion()` makes skeletal animation files (FBX first) from a text prompt. `getMotionJobStatus()` polls a job from any request, and `cancelMotionJob()` asks the provider to stop it. Aborting a stream stops local observation only. `falMotion()` runs fal Hunyuan Motion (`fal-ai/hunyuan-motion`, `fal-ai/hunyuan-motion/fast`).
