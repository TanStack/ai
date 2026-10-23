---
'@tanstack/ai-gemini': patch
---

Let Gemini 3 use a built-in tool (`googleSearchTool`, `urlContextTool`, `googleMapsTool`, `fileSearchTool`, `codeExecutionTool`) beside function tools in one `chat()` run. On the Gemini API, the adapter now sets `toolConfig.includeServerSideToolInvocations`, which Gemini needs for this mix. A request without it failed with a 400. The adapter also keeps the signed `toolCall`, `toolResponse`, `executableCode` and `codeExecutionResult` parts of a step on its provider-executed tool call (`metadata.gemini.serverParts`) and sends them back in place on the next request. Without them, the next agent-loop step failed with "Function call is missing a thought_signature". Vertex AI does not get the flag, because `@google/genai` rejects it there.
