import { describe, expect, it } from 'vitest'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeHighlight from 'rehype-highlight'
import {
  DEFAULT_REHYPE_PLUGINS,
  DEFAULT_REMARK_PLUGINS,
  resolveMarkdownPlugins,
} from '../src/markdown-plugins'

const userRemark = () => () => {}
const userRehype = () => () => {}

describe('resolveMarkdownPlugins (vue)', () => {
  it('returns defaults when no user plugins are supplied', () => {
    const { remarkPlugins, rehypePlugins } = resolveMarkdownPlugins({})
    expect(remarkPlugins).toEqual([remarkGfm])
    // @crazydos/vue-markdown adds rehype-sanitize on top automatically when
    // its `sanitize` prop is true.
    expect(rehypePlugins).toEqual([rehypeRaw, rehypeHighlight])
  })

  it('appends user remark plugins after defaults', () => {
    const { remarkPlugins } = resolveMarkdownPlugins({
      remarkPlugins: [userRemark],
    })
    expect(remarkPlugins).toEqual([remarkGfm, userRemark])
  })

  it('appends user rehype plugins after defaults', () => {
    const { rehypePlugins } = resolveMarkdownPlugins({
      rehypePlugins: [userRehype],
    })
    expect(rehypePlugins).toEqual([rehypeRaw, rehypeHighlight, userRehype])
  })

  it('drops defaults entirely when disableDefaultPlugins is true', () => {
    const { remarkPlugins, rehypePlugins } = resolveMarkdownPlugins({
      remarkPlugins: [userRemark],
      rehypePlugins: [userRehype],
      disableDefaultPlugins: true,
    })
    expect(remarkPlugins).toEqual([userRemark])
    expect(rehypePlugins).toEqual([userRehype])
  })

  it('returns empty arrays when defaults disabled and no user plugins given', () => {
    const { remarkPlugins, rehypePlugins } = resolveMarkdownPlugins({
      disableDefaultPlugins: true,
    })
    expect(remarkPlugins).toEqual([])
    expect(rehypePlugins).toEqual([])
  })

  it('does not mutate the user-supplied arrays', () => {
    const userR = [userRemark]
    const userH = [userRehype]
    resolveMarkdownPlugins({ remarkPlugins: userR, rehypePlugins: userH })
    expect(userR).toEqual([userRemark])
    expect(userH).toEqual([userRehype])
  })

  it('exposes default constants for documentation/reuse', () => {
    expect(DEFAULT_REMARK_PLUGINS).toEqual([remarkGfm])
    expect(DEFAULT_REHYPE_PLUGINS).toEqual([rehypeRaw, rehypeHighlight])
  })
})
