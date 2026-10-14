---
'@tanstack/ai-harness': patch
---

On a durable host with `stores.workClaims`, an input that reaches a host while another host owns the thread no longer takes the log from the running turn. With `stores.inbox`, the input waits in the inbox and the owner applies it (receipt `queued`). Without an inbox, it is refused with `owned_elsewhere`. A question from `ctx.session.ask` keeps its thread claimed, so an answer that reaches another host goes to the host that asked.
