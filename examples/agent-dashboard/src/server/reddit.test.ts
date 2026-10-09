import { describe, expect, it } from 'vitest'
import { parseRedditFeed } from './reddit'
import { redditReactNewsFixture } from './reddit-fixture'

describe('parseRedditFeed', () => {
  it('normalizes the real Reddit Atom shape', () => {
    const posts = parseRedditFeed(redditReactNewsFixture)
    expect(posts).toHaveLength(3)
    const [first] = posts
    expect(first.title).toBe('React Compiler is now stable in React 19.2')
    expect(first.permalink).toBe(
      'https://www.reddit.com/r/reactjs/comments/1abcd1/react_compiler_is_now_stable_in_react_192/',
    )
    expect(first.url).toBe(first.permalink)
    expect(first.subreddit).toBe('reactjs')
    expect(first.author).toBe('/u/dan_abramov')
    expect(first.updated).toBe('2026-09-24T17:00:00+00:00')
    // content HTML is stripped to plain text, entities decoded, capped
    expect(first.snippet).toContain('React Compiler')
    expect(first.snippet).not.toContain('<')
    expect(first.snippet).not.toContain('&lt;')
    expect(first.snippet.length).toBeLessThanOrEqual(280)
  })

  it('decodes numeric entities (— from &#8212;)', () => {
    const [, second] = parseRedditFeed(redditReactNewsFixture)
    expect(second.snippet).toContain('—')
  })

  it('respects the limit', () => {
    expect(parseRedditFeed(redditReactNewsFixture, 2)).toHaveLength(2)
  })

  it('is defensive against an empty / feedless payload', () => {
    expect(parseRedditFeed('')).toEqual([])
    expect(parseRedditFeed('<feed></feed>')).toEqual([])
  })
})
