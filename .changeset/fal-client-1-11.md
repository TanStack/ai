---
'@tanstack/ai-fal': minor
---

Update `@fal-ai/client` to 1.11.0.

- `fal3DModel()` now knows Meshy 7.1 (`meshy/v7.1/image-to-3d`, `multi-image-to-3d`, `text-to-3d`), Meshy 7 Retexture (`meshy/v7/retexture`), and Tripo Remesh (`tripo3d/tripo/remesh`). On Meshy 7 Retexture, an image part goes to `image_style_url`, and text goes to `text_style_prompt`.
- LTX 2.3 durations are now numbers (`6`, `8`, `10`), and the `/fast` models take `6` to `20`. Wan 2.5 Preview takes `"5"` or `"10"`.
- fal no longer serves Luma Ray 2 and Pika 2.2 text-to-video, so they are removed from the video duration table.
- `@fal-ai/client` 1.11.0 has no types for Veo, Kling 1.6, and Whisper. These models still work, with no typed options.
- `@fal-ai/client` 1.11.0 also has no types for 41 live image and video endpoints, such as Veo 3.1 first-last-frame and Kling 1.x image-to-video. A hand-kept table keeps their image input fields, so image parts still go to the correct field.
