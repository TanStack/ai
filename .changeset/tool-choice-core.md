---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
---

Add the `toolChoice` option to `chat()`.

- `chat({ toolChoice })` takes `'auto'`, `'none'`, `'required'`, or `{ type: 'tool', name }`.
- A middleware can change it for one model call in `onConfig`.
- A tool choice in `modelOptions` wins.
- No tool choice goes out when the request has no tools.
- **`@tanstack/openai-base`** sends `tool_choice` from Chat Completions and Responses, and exports `toChatCompletionsToolChoice` and `toResponsesToolChoice`.

```ts
chat({ adapter, messages, tools, toolChoice: 'required' })
chat({
  adapter,
  messages,
  tools,
  toolChoice: { type: 'tool', name: 'getWeather' },
})
```
