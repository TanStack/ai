---
'@tanstack/ai-react': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-solid': minor
---

Render `TextPart` markdown with `@tanstack/markdown` instead of the per-framework unified stacks (`react-markdown`, `@crazydos/vue-markdown`, `solid-markdown` plus `remark-gfm`, `rehype-raw`, `rehype-highlight`, `rehype-sanitize`). This drops the unified dependency tree and uses TanStack Markdown's streaming profile (raw HTML escaped, executable URLs removed, empty trailing blocks suppressed while a response streams).

**Breaking:** the `remarkPlugins`, `rehypePlugins`, and `disableDefaultPlugins` props are removed. Use `extensions` (TanStack Markdown extensions) and `highlighter` (a synchronous `CodeHighlighter`, for example from `@tanstack/highlight/markdown`) instead. Syntax highlighting is no longer applied by default; fenced code renders as `<pre class="tm-code"><code class="language-…">` until a `highlighter` is passed. Raw HTML in message content is now escaped rather than sanitized and rendered. The Solid `components` prop is removed; React keeps `components` via `MarkdownComponents`.
