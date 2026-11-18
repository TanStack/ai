---
'@tanstack/ai': patch
---

A chat loaded from stored messages now looks the same as the chat the user saw live.

- A tool result that is a string stays a string, also when the string is JSON text. Before, a tool that returned `'42'` showed the number `42`, live or after a reload. This applies to server tools, client tools, middleware skip results, and MCP text results from tools without an `outputSchema`. A server tool that returns `JSON.stringify(value)` now gives that string as `part.output`. Return the value itself to get it as an object.
- Live messages no longer get the snapshot wire fields `tanstack.createdAt` and `toolCallMetadata` in their metadata.
- A reload drops an assistant answer that holds only whitespace, as the live chat does.
- When a run stops for a client tool, the messages that `chat()` stores keep the ids of the snapshot, so a reload gives tool results the same ids.
- `ThinkingPart.stepId` is deprecated and is no longer set. Parts are the same live, stored, and reloaded.
