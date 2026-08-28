import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList as UnifiedPluggableList } from '@crazydos/vue-markdown'

/**
 * @crazydos/vue-markdown applies `rehype-sanitize` automatically when its
 * `sanitize` prop is true. The helper therefore does NOT add `rehype-sanitize`
 * itself — instead, `<TextPart>` toggles the renderer's `sanitize` prop based
 * on `disableDefaultPlugins`.
 */

export type PluggableList = UnifiedPluggableList

export const DEFAULT_REMARK_PLUGINS: PluggableList = [remarkGfm]
export const DEFAULT_REHYPE_PLUGINS: PluggableList = [
  rehypeRaw,
  rehypeHighlight,
]

export interface ResolveMarkdownPluginsOptions {
  remarkPlugins?: PluggableList
  rehypePlugins?: PluggableList
  disableDefaultPlugins?: boolean
}

export interface ResolvedMarkdownPlugins {
  remarkPlugins: PluggableList
  rehypePlugins: PluggableList
}

export function resolveMarkdownPlugins(
  options: ResolveMarkdownPluginsOptions,
): ResolvedMarkdownPlugins {
  const userRemark = options.remarkPlugins ?? []
  const userRehype = options.rehypePlugins ?? []

  if (options.disableDefaultPlugins) {
    return {
      remarkPlugins: [...userRemark],
      rehypePlugins: [...userRehype],
    }
  }

  return {
    remarkPlugins: [...DEFAULT_REMARK_PLUGINS, ...userRemark],
    rehypePlugins: [...DEFAULT_REHYPE_PLUGINS, ...userRehype],
  }
}
