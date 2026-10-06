---
'@tanstack/openai-base': patch
---

Attach an OpenAI Responses reasoning signature to its reasoning message. Before, the `REASONING_ENCRYPTED_VALUE` event used the thinking step's id as `entityId`, and no message had that id. An AG-UI client that is not TanStack's (for example, `@ag-ui/client`) dropped the value, so the next request did not send the reasoning item back. Now `entityId` is the id of the reasoning message. The signature no longer rides on `STEP_FINISHED`. This fixes every adapter that uses the Responses base: OpenAI, OpenAI-compatible, Grok, OpenRouter, Bedrock, Lovable, and Vercel AI Gateway.
