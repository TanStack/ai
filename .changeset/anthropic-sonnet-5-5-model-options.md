---
'@tanstack/ai-anthropic': patch
---

Match `claude-sonnet-5-5` to what the Claude API accepts. `modelOptions.output_config` (with `effort`) is now typed for this model. `temperature`, `top_p`, and `top_k` are no longer accepted, because the API rejects non-default values with a 400. `computerUseTool()` is no longer accepted either, because on the Claude API this model takes only the `computer_toolset_20260801` toolset. The other provider tools are unchanged.
