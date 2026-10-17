---
'@tanstack/ai-harness': patch
---

An input that reaches a host while another host owns the thread waits in the input lane of the log, and the owner runs it (receipt `queued`). The running turn on the owner goes on. The input keeps its JSON overrides (`model`, `modelOptions`, `reasoning`, and `promptCache`). An answer to a question from `ctx.session.ask` goes to the host that asked, and the log keeps a secret answer as `[secret]`.
