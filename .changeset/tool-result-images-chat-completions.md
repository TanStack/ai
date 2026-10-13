---
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
---

Images in tool results now reach the model on Chat Completions and on OpenRouter Responses.

- Chat Completions adapters (OpenAI and the adapters built on `@tanstack/openai-base`, and OpenRouter chat) send the tool text in the tool message and the images in one user message after the tool results. Before this fix, OpenAI sent the parts as a JSON string in the tool text, and OpenRouter dropped the images.
- OpenRouter Responses sends the images as `input_image` parts of the function call output. Before this fix, it dropped them.
- On Chat Completions, a result with only images gets the tool text `(see attached image)`.
- A model without image input gets no images. A result with only images then has the text `(image omitted: this model has no image input)`. The OpenAI Responses adapter now uses this text too.
- Other media (audio, video, documents) in a tool result with images is not sent on these adapters.
- OpenRouter chat with automatic prompt caching on an `anthropic/*` model puts the cache marker on the tool result before that image message, because the image message has no text block.
