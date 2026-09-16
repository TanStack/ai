---
title: Highlight markdown code
id: ui-markdown-highlight
order: 9
description: "Color fenced code in TextPart with TanStack Highlight."
keywords:
  - tanstack ai
  - TextPart
  - markdown
  - highlight
  - syntax highlighting
---

Model replies include fenced code. `TextPart` renders those fences as plain text until you pass a `highlighter`.

Build a TanStack Highlight callback. Pass it to `TextPart`. Token colors then show on fenced blocks.

If your app still passes `remarkPlugins` or `rehypePlugins`, start with [TextPart markdown](../migration/text-part-markdown).

## 1. Install TanStack Highlight

```sh
pnpm add @tanstack/highlight
```

Use `@tanstack/highlight` 0.0.6 or newer. The Markdown adapter lives in that package.

## 2. Create the highlighter

Create `src/markdown-highlighter.ts`. Register only the languages your models emit.

```ts
import { createHighlighter } from '@tanstack/highlight/core'
import { js } from '@tanstack/highlight/languages/js'
import { json } from '@tanstack/highlight/languages/json'
import { plaintext } from '@tanstack/highlight/languages/plaintext'
import { ts } from '@tanstack/highlight/languages/ts'
import { tsx } from '@tanstack/highlight/languages/tsx'
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown'
import type { CodeHighlighter } from '@tanstack/markdown'

const highlighter = createHighlighter({
  languages: [plaintext, js, json, ts, tsx],
})

export const highlightMarkdownCode: CodeHighlighter =
  createTanStackMarkdownHighlighter(highlighter)
```

Unknown fence languages render as escaped plain text.

> **CAUTION:** Highlighter output is inserted as trusted HTML. Use `createTanStackMarkdownHighlighter`. Do not pass a highlighter that returns unescaped source text.

## 3. Create the theme CSS

Create `src/markdown-highlight-theme.ts`. Point the selectors at a `.markdown-renderer` wrapper.

```ts
import { createThemeCss } from '@tanstack/highlight/theme'
import { githubDarkTheme } from '@tanstack/highlight/themes/github-dark'
import { githubLightTheme } from '@tanstack/highlight/themes/github-light'

export const markdownHighlightCss = createThemeCss({
  light: githubLightTheme,
  dark: githubDarkTheme,
  lightSelector: '.markdown-renderer',
  darkSelector: '.dark .markdown-renderer',
  codeBlockSelector: '.markdown-renderer pre.tm-code',
  lineNumbersSelector: '.markdown-renderer .tm-code--line-numbers',
})
```

## 4. Pass it to TextPart

Put `markdown-renderer` on the `TextPart` wrapper so the theme CSS matches.

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

## 5. Wire it into createChatHook

Inject the CSS once in `layout`. Register `TextPart` as `partsComponents.text`.

```tsx
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook, TextPart } from '@tanstack/ai-react/ui'
import { highlightMarkdownCode } from './markdown-highlighter'
import { markdownHighlightCss } from './markdown-highlight-theme'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  components: {
    input: () => {
      const chat = useChatContext()
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const field = event.currentTarget.elements.namedItem('message')
            if (!(field instanceof HTMLInputElement)) return
            const text = field.value.trim()
            if (!text) return
            field.value = ''
            void chat.sendMessage(text)
          }}
        >
          <input name="message" />
          <button type="submit">Send</button>
        </form>
      )
    },
    layout: ({ Messages, Input }) => (
      <main>
        <style>{markdownHighlightCss}</style>
        <Messages />
        <Input />
      </main>
    ),
    message: ({ message, Parts }) => (
      <article data-role={message.role}>
        <Parts />
      </article>
    ),
  },
  partsComponents: {
    text: ({ part }) => (
      <TextPart
        content={part.content}
        highlighter={highlightMarkdownCode}
        className="markdown-renderer"
      />
    ),
    fallback: () => null,
  },
})

export function ChatScreen() {
  const chat = useAppChat()
  return <chat.AppChat />
}
```

Send a prompt that returns a fenced `ts` block. The fence now shows token colors.

## Vue and Solid

Use the same highlighter file and the same theme file. The `TextPart` import changes. Inject `markdownHighlightCss` once at the app root.

### Vue

```ts
import { defineComponent, h } from 'vue'
import { TextPart } from '@tanstack/ai-vue/ui'
import { highlightMarkdownCode } from './markdown-highlighter'

export default defineComponent({
  props: { content: { type: String, required: true } },
  setup(props) {
    return () =>
      h(TextPart, {
        content: props.content,
        highlighter: highlightMarkdownCode,
        class: 'markdown-renderer',
      })
  },
})
```

### Solid

```tsx
import { TextPart } from '@tanstack/ai-solid/ui'
import { highlightMarkdownCode } from './markdown-highlighter'

export function Reply(props: { content: string }) {
  return (
    <TextPart
      content={props.content}
      highlighter={highlightMarkdownCode}
      class="markdown-renderer"
    />
  )
}
```

Vue and Solid have no `components` map. Tag swaps go through a TanStack Markdown `extension`.

## Later

- More languages: import them from `@tanstack/highlight/languages/*` and add them to `createHighlighter`.
- Fence metadata and line numbers: see the [TanStack Markdown highlighting guide](https://tanstack.com/markdown/latest/docs/guides/syntax-highlighting).
- React tag swaps (`a`, `img`): pass `components` on `TextPart`. That map uses normal HTML props, not `react-markdown` extras such as `inline`.
