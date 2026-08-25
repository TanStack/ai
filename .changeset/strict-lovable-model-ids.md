---
'@tanstack/ai-lovable': minor
---

`LovableModelId` is now the curated `LovableChatModel` union. The `(string & {})` escape hatch is removed, so TypeScript rejects uncurated model ids in `lovableText`, `createLovableText`, `lovableResponsesText`, `createLovableResponsesText`, and the summarize factories. The other modalities (image, video, embedding, TTS, transcription) were already limited to their curated lists.
