---
'@tanstack/ai-byteplus': patch
---

Attach BytePlus Ark `encrypted_content` to its reasoning message. Before, the `REASONING_ENCRYPTED_VALUE` event used the thinking step's id as `entityId`, and no message had that id. An AG-UI client that is not TanStack's (for example, `@ag-ui/client`) dropped the value, so the next request did not send `encrypted_content` back. Now `entityId` is the id of the reasoning message, and the blob no longer rides on `STEP_FINISHED`.
