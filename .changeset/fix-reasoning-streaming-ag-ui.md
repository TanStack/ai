---
'@tanstack/ai-openai': patch
'@tanstack/ai': patch
---

Fix reasoning token streaming for gpt-5-mini and gpt-5-nano models (AG-UI)

- Added OpenAIReasoningOptions to gpt-5-mini and gpt-5-nano models
- Fixed summary option placement (inside reasoning object)
- Added handler for response.reasoning_summary_text.delta events
- Emits AG-UI STEP_STARTED/STEP_FINISHED events for reasoning summaries
- Added OpenAIReasoningOptionsWithConcise for computer-use-preview model
- Serialize tool result to string in handleToolCallEndEvent for consistent event format
