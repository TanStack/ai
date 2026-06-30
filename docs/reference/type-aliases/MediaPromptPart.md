---
id: MediaPromptPart
title: MediaPromptPart
---

# Type Alias: MediaPromptPart

```ts
type MediaPromptPart = 
  | TextPart
  | ImagePart<MediaInputMetadata>
  | VideoPart<MediaInputMetadata>
| AudioPart<MediaInputMetadata>;
```

Defined in: [packages/ai/src/types.ts:1566](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1566)

A single part of a multimodal media-generation prompt. Reuses the chat
content-part shapes: text parts carry the instruction, image / video /
audio parts carry conditioning inputs (with an optional
`metadata.role` hint — see [MediaInputRole](MediaInputRole.md)).
