/**
 * The Reddit fetcher: a *real* service tool. No LLM, no auth, no key — it reads
 * Reddit's public **RSS (Atom)** feeds and normalizes them into a small,
 * digest-friendly shape. Read-only by construction: there is no code path here
 * that writes to Reddit (no posting, voting, or OAuth).
 *
 * Why RSS and not `.json`: Reddit's public JSON (`/r/x/new.json`) is blocked
 * (`403`) for many datacenter / VPN egress IPs regardless of `User-Agent`,
 * whereas the Atom feed (`/r/x/new.rss`) is served (`200`). RSS carries title,
 * link, author, timestamp and the post body — enough for a sentiment digest —
 * but NOT score / comment counts, so those are omitted.
 *
 * Rate posture: Reddit rate-limits bursts (a rapid second request can `429`); a
 * 30-min timer is far under any limit.
 *
 * Server-only.
 */
import { redditReactNewsFixture } from './reddit-fixture'

/** A real User-Agent — Reddit is stingier with default/empty ones. */
const USER_AGENT =
  'tanstack-agent-dashboard/0.1 (poc; contact: https://github.com/TanStack/ai)'

export interface RedditPost {
  title: string
  /** The post's link (same as permalink for a self/discussion post). */
  url: string
  permalink: string
  subreddit: string
  author: string
  /** ISO timestamp from the feed entry. */
  updated: string
  /** First ~280 chars of the post body, HTML/entities stripped. */
  snippet: string
}

export interface RedditSearchArgs {
  subreddits?: Array<string>
  query?: string
  sort?: 'new' | 'hot' | 'top' | 'relevance'
  time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'
  limit?: number
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripHtml(html: string): string {
  return decodeEntities(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Inner text of the first `<name>…</name>` etc. within an entry. */
function tagText(entry: string, name: string): string {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(entry)
  return m ? m[1] : ''
}

/** An attribute off the first `<name … attr="…">` within an entry. */
function tagAttr(entry: string, name: string, attr: string): string {
  const m = new RegExp(`<${name}[^>]*\\b${attr}="([^"]*)"`).exec(entry)
  return m ? m[1] : ''
}

/**
 * Parse a Reddit Atom feed into posts. Deliberately regex-based — Reddit's Atom
 * output is regular and this keeps the example dependency-free; the unit test
 * pins it against a recorded fixture.
 *
 * ponytail: regex over Atom, not a real XML parser. Fine for Reddit's stable
 * feed shape; swap in a streaming XML parser if we ever consume arbitrary feeds.
 */
export function parseRedditFeed(xml: string, limit = 10): Array<RedditPost> {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  return entries.slice(0, limit).map((e) => {
    const link = tagAttr(e, 'link', 'href')
    return {
      title: decodeEntities(tagText(e, 'title')).trim(),
      url: link,
      permalink: link,
      subreddit: tagAttr(e, 'category', 'term'),
      author: stripHtml(tagText(e, 'name')),
      updated: tagText(e, 'updated').trim(),
      snippet: stripHtml(tagText(e, 'content')).slice(0, 280),
    }
  })
}

/** Build the public Atom-feed URL for a search or a plain listing. */
function feedUrl(args: RedditSearchArgs, limit: number): string {
  const subs = (args.subreddits ?? ['reactjs']).join('+')
  const sort = args.sort ?? 'new'
  const time = args.time ?? 'day'
  if (args.query) {
    const q = encodeURIComponent(args.query)
    return `https://www.reddit.com/r/${subs}/search.rss?q=${q}&restrict_sr=1&sort=${sort}&t=${time}&limit=${limit}`
  }
  return `https://www.reddit.com/r/${subs}/${sort}.rss?limit=${limit}&t=${time}`
}

/**
 * Fetch and normalize recent React news. Under `VITE_E2E` it serves the recorded
 * fixture so the e2e loop is deterministic and offline; otherwise it reads the
 * live Atom feed with a real User-Agent.
 */
export async function fetchReactNews(
  args: RedditSearchArgs = {},
): Promise<Array<RedditPost>> {
  const limit = args.limit ?? 10
  if (process.env.VITE_E2E === '1') {
    return parseRedditFeed(redditReactNewsFixture, limit)
  }
  const res = await fetch(feedUrl(args, limit), {
    headers: { 'user-agent': USER_AGENT, accept: 'application/atom+xml' },
  })
  if (!res.ok)
    throw new Error(`Reddit responded ${res.status} ${res.statusText}`)
  return parseRedditFeed(await res.text(), limit)
}
