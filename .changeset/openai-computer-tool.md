---
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
---

`computerUseTool({ type: 'computer' })` adds the computer tool of the newer OpenAI models, for example `gpt-6.1-sol`. The tool name is `computer`. Each call has the batched `actions` of the model and the `pending_safety_checks`, and the replay sends the actions back as they came. `computerUseTool({ type: 'computer_use_preview', ... })` for the `computer-use-preview` model works as before. The Responses tool choice type also accepts `computer`. Computer screenshots now go out with `detail: 'original'`, as in OpenAI's computer use guide.
