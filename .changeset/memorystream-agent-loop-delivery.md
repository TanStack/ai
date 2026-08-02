---
'@tanstack/ai': patch
---

Fix `memoryStream` truncating a tool-calling (agent-loop) run at its first tool
call.

An agent-loop run emits one `RUN_STARTED`/`RUN_FINISHED` pair per iteration
(`finishReason: "tool_calls"` for a turn that calls a tool, then `"stop"` for the
final answer). `memoryStream` treated the _first_ terminal chunk as the end of
the log — both marking the log complete on append and ending the reader on read —
so a run that called a tool was delivered only up to that first `RUN_FINISHED`:
the tool result and everything after (the model's actual answer) never reached
the client, leaving the tool call stuck "running" and the reply missing, on the
initial stream and on any reconnect/reload.

Completion is now driven solely by the producer calling `close()` (which it does
on every exit — the documented `StreamDurability.close` contract, honored by
`toServerSentEventsResponse`/`resumeServerSentEventsResponse` and detached
producers). The reader tails across per-iteration terminals and ends when the
producer closes, so a tool-calling run is delivered in full — live, on rejoin,
and on a server-authoritative reload.
