---
'@tanstack/ai': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
---

Tighten the AG-UI adapter contract and simplify the core stream processor.

**Breaking type changes:**

- `TextMessageContentEvent.delta` is now required (was optional)
- `StepFinishedEvent.delta` is now required (was optional)

All first-party adapters already sent `delta` on every event, so this is a type-level enforcement of existing behavior. Community adapters that follow the reference implementations will not need code changes.

**Core processor simplifications:**

- `TEXT_MESSAGE_START` now resets text segment state, replacing heuristic overlap detection
- `TOOL_CALL_END` is now the authoritative signal for tool call input completion
- Removed delta/content fallback logic, whitespace-only message cleanup, and finish-reason conflict arbitration from the processor

**Adapter fixes:**

- Gemini: filter whitespace-only text parts, fix STEP_FINISHED content accumulation, emit fresh TEXT_MESSAGE_START after tool calls
- Anthropic: emit fresh TEXT_MESSAGE_START after tool_use blocks for proper text segmentation
