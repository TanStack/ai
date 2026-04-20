---
'@tanstack/ai-gemini': patch
---

fix(ai-gemini): read/write thoughtSignature at Part level for Gemini 3.x

Gemini 3.x models emit `thoughtSignature` as a Part-level sibling of `functionCall` (per the `@google/genai` `Part` type definition), not nested inside `functionCall`. The adapter was reading from `functionCall.thoughtSignature` (which doesn't exist in the SDK types) and writing it back nested inside `functionCall`, causing the Gemini API to reject subsequent tool-call turns with `400 INVALID_ARGUMENT: "Function call is missing a thought_signature"`.

This fix:

- **Read side:** reads `part.thoughtSignature` first, falls back to `functionCall.thoughtSignature` for older Gemini 2.x models
- **Write side:** emits `thoughtSignature` as a Part-level sibling of `functionCall` instead of nesting it inside
