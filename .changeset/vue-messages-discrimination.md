---
'@tanstack/ai-vue': patch
---

Fix `useChat` in Vue: `messages`, `partial`, and `final` now use `Readonly<ShallowRef<X>>` instead of `DeepReadonly<ShallowRef<X>>`. The deep-readonly wrapper was contradictory over a shallow ref and silently collapsed the `MessagePart` discriminated union, breaking `parts.find(p => p.type === 'structured-output')?.data` narrowing in consumer code. The runtime behavior is unchanged.
