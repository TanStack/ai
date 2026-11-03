---
'@tanstack/ai-bedrock': patch
---

Aborting a chat now cancels the Converse request to Bedrock, for streaming and for structured output. Before, the request kept running.
