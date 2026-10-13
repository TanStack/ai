---
'@tanstack/ai-persistence': patch
---

A message store now keeps the mid-conversation change record of an assistant message when a client sends the same message again without it. With `useChat`, the prompt cache then holds across turns on models that get tool and prompt changes inside the conversation.
