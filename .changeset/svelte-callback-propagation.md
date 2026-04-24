---
'@tanstack/ai-svelte': patch
---

fix(ai-svelte): propagate `createChat` callback changes uniformly

`onResponse`, `onChunk`, and `onCustomEvent` were passed as direct references to the underlying `ChatClient`, while `onFinish` and `onError` were wrapped to read from `options.onX?.(...)` at call time. This meant callers who mutated the options object in-place (or invoked `client.updateOptions(...)`) would see their replacement propagate for the latter two but silently miss for the former three. All five user-supplied callbacks now go through the same indirection, matching the React / Preact / Vue / Solid sibling wrappers.
