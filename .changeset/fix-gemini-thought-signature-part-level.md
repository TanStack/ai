---
'@tanstack/ai-gemini': patch
---

fix(ai-gemini): read/write thoughtSignature at Part level

Gemini emits `thoughtSignature` as a Part-level sibling of `functionCall` (per the `@google/genai` `Part` type definition), not nested inside `functionCall`. The `FunctionCall` type has never had a `thoughtSignature` property. The adapter was reading from `functionCall.thoughtSignature` (which doesn't exist in the SDK types) and writing it back nested inside `functionCall`, causing Gemini 3.x to reject subsequent tool-call turns with `400 INVALID_ARGUMENT: "Function call is missing a thought_signature"`.

This fix:

- **Read side:** reads `part.thoughtSignature` directly, using the SDK's typed `Part` interface
- **Write side:** emits `thoughtSignature` as a Part-level sibling of `functionCall`, using the SDK's typed `Part` interface
