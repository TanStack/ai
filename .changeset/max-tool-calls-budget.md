---
'@tanstack/ai': minor
---

Bound tool-call fan-out in agent loops: `AgentLoopState` now exposes `toolCallCount` and `lastTurnToolCallCount`, `maxToolCalls(n)` strategy caps cumulative tool calls, and `chat({ maxToolCallsPerTurn })` caps how many parallel calls execute in a single turn.
