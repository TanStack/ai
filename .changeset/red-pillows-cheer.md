---
'@tanstack/ai-react-ui': patch
---

Fix `ChatMessage` rendering of multimodal tool results. Tool-result content is `string | Array<ContentPart>`, but the renderer previously typed the message part as `any` and passed the raw content straight to React — an array of content-part objects would throw React's "Objects are not valid as a React child". The part is now typed as `UIMessage['parts'][number]`, and array content is flattened to the concatenation of its text parts (non-text parts are skipped) before rendering, both for the built-in renderer and the `toolResultRenderer` prop.
