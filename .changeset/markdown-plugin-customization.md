---
'@tanstack/ai-react-ui': minor
'@tanstack/ai-solid-ui': minor
'@tanstack/ai-vue-ui': minor
---

`TextPart` now accepts `remarkPlugins`, `rehypePlugins`, and (React/Solid)
`components` props, plus a `disableDefaultPlugins` escape hatch. User plugins
merge with the secure defaults — `rehype-sanitize` continues to run last
unless defaults are disabled.

This fixes [#164](https://github.com/TanStack/ai/issues/164): bold and
emphasis in Japanese, Chinese, and Korean text rendered incorrectly because
of a CommonMark spec defect. Consumers can now drop in
[`remark-cjk-friendly`](https://www.npmjs.com/package/remark-cjk-friendly)
with a single prop:

```tsx
import remarkCjkFriendly from 'remark-cjk-friendly'
;<TextPart content={content} remarkPlugins={[remarkCjkFriendly]} />
```

Also fixes a latent bug in `@tanstack/ai-react-ui` where `remark-gfm` was
passed inside the rehype plugin array, silently disabling GFM features
(tables, strikethrough, task lists) in the React `TextPart`.

`@tanstack/ai-vue-ui` omits the `components` prop because its underlying
renderer (`@crazydos/vue-markdown`) does not expose component overrides;
use that library's slot API for custom rendering.
