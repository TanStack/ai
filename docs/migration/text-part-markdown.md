---
title: TextPart markdown
id: migrate-text-part-markdown
order: 6
description: "Move TextPart off remarkPlugins and rehypePlugins onto TanStack Markdown, and see what renders differently."
keywords:
  - tanstack ai
  - TextPart
  - markdown
  - migration
  - breaking changes
---

Your `TextPart` stopped type-checking on `remarkPlugins`, `rehypePlugins`, or `disableDefaultPlugins`. `TextPart` from `@tanstack/ai-react/ui`, `@tanstack/ai-vue/ui`, and `@tanstack/ai-solid/ui` now renders with [TanStack Markdown](https://tanstack.com/markdown). Pass `extensions` and `highlighter` instead.

This page is only for apps that import the `TextPart` component. `createChatHook` does not use it unless you pass it as `partsComponents.text`.

## Upgrade

1. Find each `TextPart` in your code that has a plugin prop or a Solid `components` prop.
2. Replace each prop with the [prop map](#prop-map) below.
3. If you want colored code fences, follow [Syntax highlighting](#syntax-highlighting).
4. Read [Silent changes](#silent-changes). Default `<TextPart content={...} />` compiles, but some output looks different.

## Prop map

| Old prop | New prop |
| --- | --- |
| `remarkPlugins` | `extensions` (`MarkdownExtension[]` from `@tanstack/markdown`) |
| `rehypePlugins` | `extensions` or `highlighter` |
| `disableDefaultPlugins` | Removed. The streaming extension is always on. |
| Solid `components` | Removed |
| React `components` | `components` (`MarkdownComponents`: a tag-name map with normal HTML props) |

A unified plugin, such as `remark-gfm` or `remark-cjk-friendly`, is not a TanStack Markdown extension. You cannot pass it through.

## Replace plugin props

### CJK bold

TanStack Markdown parses CJK bold with no plugin. Remove the plugin:

```tsx ignore
// Before
import { TextPart } from '@tanstack/ai-react/ui'
import remarkCjkFriendly from 'remark-cjk-friendly'

<TextPart content={content} remarkPlugins={[remarkCjkFriendly]} />
```

```tsx
// After
import { TextPart } from '@tanstack/ai-react/ui'

export function Reply({ content }: { content: string }) {
  return <TextPart content={content} />
}
```

### Syntax highlighting

The old stack ran `rehype-highlight`. Then `rehype-sanitize` removed the `hljs-*` classes, so fenced code already looked plain.

To get colors, pass a TanStack Highlight callback. For the full steps, see [Highlight markdown code](../ui/markdown).

```tsx ignore
// Before
<TextPart content={content} />
```

```tsx
// After
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

### Other remark or rehype plugins

A unified plugin has no drop-in replacement. Write the behavior again as a TanStack Markdown extension, or do it outside `TextPart`.

You cannot turn off the streaming extension.

## React `components`

React still accepts `components`, but the type is now `MarkdownComponents`, not the `Components` type of `react-markdown`. TanStack Markdown passes only intrinsic HTML props.

A common override still type-checks, but renders wrong, because `inline` is always `undefined`:

```tsx ignore
// Before: compiles, but every code element renders as a block
<TextPart
  content={content}
  components={{
    code: ({ inline, children }) =>
      inline ? <code>{children}</code> : <pre>{children}</pre>,
  }}
/>
```

```tsx
// After
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

To tell a fence from inline code, read `className` (for example `language-ts`). Do not read `inline` or `node`.

## Silent changes

These changes happen with a default `<TextPart content={...} />`. You get no type error.

| Input | Before | After |
| --- | --- | --- |
| Bare URL `https://example.com` | Auto-linked | Plain text |
| Raw HTML such as `<br>` or `<img>` | Sanitized, then rendered | Escaped text |
| Task list | `contains-task-list` / `task-list-item` | Checkbox on a plain `<li>` |
| Fenced code | Plain (highlight classes removed) | Plain, with `tm-code` / `language-*` |
| CJK bold `**…。**次` | Failed without a plugin | Works |

Tables, lists, strikethrough, and fenced code still render.

These things do not change:

- `createChatHook` apps that render `{part.content}` themselves.
- The import path: still `@tanstack/ai-react/ui` (or the Vue or Solid `/ui` subpath).
- The `TextPart` data type on messages (`{ type: 'text', content }`). That is a type, not this component.

## Done

Your type checker passes, and your replies render with TanStack Markdown. To add colored code fences, follow [Highlight markdown code](../ui/markdown).
