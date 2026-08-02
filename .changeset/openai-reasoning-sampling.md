---
'@tanstack/ai-openai': patch
---

Drop `temperature` / `top_p` for OpenAI reasoning models so they don't 400.

The o-series and the GPT-5 reasoning family reject `temperature`/`top_p`
(`400 Unsupported parameter`), but a caller — or the summarize adapter's
low-temperature default — has no way to know a given model does. The OpenAI text
adapter now strips both for reasoning models (matched by
`openAIModelRejectsSamplingParams`, which covers `o*` and non-`*-chat-latest`
`gpt-5*` plus `codex-mini-latest`). Stripping only ever averts a guaranteed 400,
so it never changes an otherwise-valid request. This fixes `summarize` (and chat)
on `gpt-5.5` and other reasoning models.
