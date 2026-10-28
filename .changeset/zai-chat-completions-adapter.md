---
'@tanstack/ai-zai': minor
---

Add the Z.AI adapter. It drives Z.AI's OpenAI-compatible Chat Completions API through `@tanstack/openai-base` and ships the GLM-5 and GLM-4 model catalog (`glm-5.3`, `glm-5.3-flash`, and `glm-5.2` first), `createZAIText`/`zaiText`, `createZAISummarize`/`zaiSummarize`, the branded `zaiWebSearchTool`, and a `zaiByok` descriptor at `@tanstack/ai-zai/byok` so a browser-supplied key wins over `ZAI_API_KEY`.

The adapter sets the coding-plan base URL when `coding: true` is passed. It sends `json_object` plus a schema system prompt because Z.AI rejects `json_schema`, pins `tool_choice` to `auto`, and streams `delta.reasoning_content` as AG-UI reasoning events.
