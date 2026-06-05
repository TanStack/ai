---
'@tanstack/ai': patch
---

fix(ai): produce new object references in tool-call message updaters

`updateToolCallApproval`, `updateToolCallState`, `updateToolCallWithOutput`,
and `updateToolCallApprovalResponse` previously mutated the found tool-call
part in-place (`toolCallPart.state = ...`) after spreading the parts array.
The shallow `[...msg.parts]` copy created a new array but preserved the
original object references, so frameworks that rely on reference identity
for change detection (Svelte 5 proxies, Vue 3 reactivity, etc.) could not
observe the updates.

Each function now replaces the part at its index with a spread copy
(`parts[index] = { ...toolCallPart, ...changes }`), producing a fresh
object on every update. This aligns with the pattern already used by
`updateToolCallPart`, `updateTextPart`, and `updateThinkingPart`.
