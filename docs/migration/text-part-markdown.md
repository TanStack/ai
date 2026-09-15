---
title: TextPart markdown
id: migrate-text-part-markdown
order: 6
description: "Move TextPart off remarkPlugins and rehypePlugins onto TanStack Markdown."
keywords:
  - tanstack ai
  - TextPart
  - markdown
  - migration
  - breaking changes
---

> **TL;DR:** This is a breaking change. `TextPart` no longer accepts `remarkPlugins`, `rehypePlugins`, or `disableDefaultPlugins`. Pass `extensions` and `highlighter` instead. Default `<TextPart content={...} />` still type-checks. Bare URLs stay plain text. Raw HTML in the model is escaped.

`TextPart` from `@tanstack/ai-react/ui`, `@tanstack/ai-vue/ui`, and `@tanstack/ai-solid/ui` now renders with [TanStack Markdown](https://tanstack.com/markdown).

This page is only for people who already import that component. `createChatHook` does not use it unless you pass it as `partsComponents.text`. Deprecated `ChatMessage` still prints plain text.

## Who this hits

- You passed `remarkPlugins`, `rehypePlugins`, or `disableDefaultPlugins`. Type-check fails.
- You passed Solid `components`. Type-check fails. React `components` stays, with a new type.
- You used default `TextPart` with only `content`. It compiles. Output can look different (see [Silent changes](#silent-changes)).

## Prop map

| Old prop | New prop |
| --- | --- |
| `remarkPlugins` | `extensions` (`MarkdownExtension[]` from `@tanstack/markdown`) |
| `rehypePlugins` | `extensions` or `highlighter` |
| `disableDefaultPlugins` | gone. The streaming extension is always on |
| Solid `components` | gone |
| React `components` | `components` (`MarkdownComponents`: a tag-name map with normal HTML props) |

A unified plugin such as `remark-gfm` or `remark-cjk-friendly` is not a TanStack Markdown extension. You cannot pass it through.

## Replace plugin props

### CJK bold

TanStack Markdown parses CJK bold with no plugin.

```tsx ignore
import { TextPart } from '@tanstack/ai-react/ui'
import remarkCjkFriendly from 'remark-cjk-friendly'

<TextPart content={content} remarkPlugins={[remarkCjkFriendly]} />
```

```tsx
import { TextPart } from '@tanstack/ai-react/ui'

export function Reply({ content }: { content: string }) {
  return <TextPart content={content} />
}
```

### Syntax highlighting

The old stack ran `rehype-highlight`, then `rehype-sanitize` stripped the `hljs-*` classes. Fenced code already looked plain.

To get colors now, pass a TanStack Highlight callback. Full steps: [Highlight markdown code](../ui/markdown).

```tsx ignore
<TextPart content={content} />
```

```tsx
import { TextPart } from '@tanstack/ai-react/ui'
import { highlightMarkdownCode } from './markdown-highlighter'

export function Reply({ content }: { content: string }) {
  return (
    <TextPart
      content={content}
      highlighter={highlightMarkdownCode}
      className="markdown-renderer"
    />
  )
}
```

### Extra remark or rehype plugins

There is no drop-in for a unified plugin. Rewrite the behavior as a TanStack Markdown `extension`, or handle it outside `TextPart`.

`disableDefaultPlugins` is gone. You cannot turn off the streaming extension.

## React `components`

React still accepts `components`. The type is no longer `react-markdown` `Components`. TanStack Markdown passes intrinsic HTML props only.

A common override still type-checks, then mis-renders. `inline` is always `undefined`.

```tsx ignore
<TextPart
  content={content}
  components={{
    code: ({ inline, children }) =>
      inline ? <code>{children}</code> : <pre>{children}</pre>,
  }}
/>
```

```tsx
import { TextPart } from '@tanstack/ai-react/ui'

export function Reply({ content }: { content: string }) {
  return (
    <TextPart
      content={content}
      components={{
        a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
      }}
    />
  )
}
```

Branch on `className` (for example `language-ts`) if you need fence vs inline. Do not read `inline` or `node`.

## Silent changes

These happen with default `<TextPart content={...} />`. There is no type error.

| Input | Before | After |
| --- | --- | --- |
| Bare URL `https://example.com` | Auto-linked | Plain text |
| Raw HTML such as `<br>` or `<img>` | Sanitized, then rendered | Escaped text |
| Task list | `contains-task-list` / `task-list-item` | Checkbox on a plain `<li>` |
| Fenced code | Plain (highlight classes stripped) | Plain, with `tm-code` / `language-*` |
| CJK bold `**…。**次` | Failed without a plugin | Works |

Tables, lists, strikethrough, and fenced code still render.

## What does not change

- `createChatHook` apps that render `{part.content}` themselves.
- Deprecated `ChatMessage` text output (plain text).
- Import path: still `@tanstack/ai-react/ui` (or Vue / Solid `/ui`).
- The `TextPart` data type on messages (`{ type: 'text', content }`). That is not this component.

When the type error is gone and you want colored fences, follow [Highlight markdown code](../ui/markdown).
