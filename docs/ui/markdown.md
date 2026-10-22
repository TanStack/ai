---
title: Highlight markdown code
id: ui-markdown-highlight
order: 9
description: "Color the fenced code blocks in model replies. Pass a TanStack Highlight highlighter to TextPart."
keywords:
  - tanstack ai
  - TextPart
  - markdown
  - highlight
  - syntax highlighting
---

Pass a TanStack Highlight `highlighter` to `TextPart`. Fenced code then renders with token colors.

`TextPart` is in the React, Vue, and Solid UI packages. If your app still passes `remarkPlugins` or `rehypePlugins`, start with [TextPart markdown](../migration/text-part-markdown).

## Quick setup

These steps use React. For Vue and Solid, steps 1 to 3 are the same. Step 4 is different. See [Vue and Solid](#vue-and-solid).

### 1. Install TanStack Highlight

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/highlight
vue: @tanstack/highlight
solid: @tanstack/highlight

<!-- ::end:tabs -->

Use `@tanstack/highlight` 0.0.6 or newer. The markdown adapter is in that package.

### 2. Create the highlighter

Create `src/markdown-highlighter.ts`. Register only the languages that your models write:

```ts
import { createHighlighter } from '@tanstack/highlight/core'
import { js } from '@tanstack/highlight/languages/js'
import { json } from '@tanstack/highlight/languages/json'
import { plaintext } from '@tanstack/highlight/languages/plaintext'
import { ts } from '@tanstack/highlight/languages/ts'
import { tsx } from '@tanstack/highlight/languages/tsx'
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown'

const highlighter = createHighlighter({
  languages: [plaintext, js, json, ts, tsx],
})

export const highlightMarkdownCode =
  createTanStackMarkdownHighlighter(highlighter)
```

A fence with an unknown language renders as escaped plain text.

> [!WARNING]
> Use `createTanStackMarkdownHighlighter`. `TextPart` inserts the highlighter output as trusted HTML. A highlighter that returns unescaped source text lets model output inject HTML.

### 3. Create the theme CSS

Create `src/markdown-highlight-theme.ts`. Point the selectors at a `.markdown-renderer` wrapper:

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

### 4. Use it in the chat

Register `TextPart` as `partsComponents.text`. Pass the highlighter, and put `markdown-renderer` on the wrapper so that the theme CSS matches. Inject the CSS once in `layout`:

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
  const chat = useAppChat({ threadId: 'support-chat' })
  return <chat.AppChat />
}
```

Send a prompt that returns a fenced `ts` block. The fence now shows token colors.

## How it works

- `createHighlighter` tokenizes code for the languages that you register.
- `createTanStackMarkdownHighlighter` turns it into the `CodeHighlighter` that TanStack Markdown calls for each fence. It escapes the source text.
- `createThemeCss` writes CSS for the token classes, one theme for light mode and one for dark mode.

## Vue and Solid

Use the same highlighter file and the same theme file. Inject `markdownHighlightCss` once, at the app root. Then pass the highlighter to `TextPart` from your UI package.

Vue:

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

Solid:

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

You now have colored code in model replies.

## Advanced

- **More languages:** import them from `@tanstack/highlight/languages/*` and add them to `createHighlighter`.
- **Fence metadata and line numbers:** read the [TanStack Markdown highlighting guide](https://tanstack.com/markdown/latest/docs/guides/syntax-highlighting).
- **Tag swaps in React** (`a`, `img`): pass `components` to `TextPart`. That map uses normal HTML props.
- **Tag swaps in Vue and Solid:** these `TextPart` components have no `components` map. Use a TanStack Markdown extension.
