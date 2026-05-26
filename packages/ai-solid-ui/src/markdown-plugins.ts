import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import type { SolidMarkdownOptions } from 'solid-markdown'

export type PluggableList = SolidMarkdownOptions['remarkPlugins']

export const DEFAULT_REMARK_PLUGINS: PluggableList = [remarkGfm]
export const DEFAULT_REHYPE_PLUGINS_BEFORE_USER: PluggableList = [
  rehypeRaw,
  rehypeHighlight,
]
export const DEFAULT_REHYPE_PLUGINS_AFTER_USER: PluggableList = [rehypeSanitize]

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
    rehypePlugins: [
      ...DEFAULT_REHYPE_PLUGINS_BEFORE_USER,
      ...userRehype,
      ...DEFAULT_REHYPE_PLUGINS_AFTER_USER,
    ],
  }
}
