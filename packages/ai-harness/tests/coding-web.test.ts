import { createServer } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { webTools } from '../src/first-party/coding/web'
import type { AddressInfo } from 'node:net'
import type {
  SearchProvider,
  WebToolsOptions,
} from '../src/first-party/coding/web'

// DNS is the network boundary. Each lookup of a name takes its next
// answer, and the last answer repeats.
const dns = vi.hoisted(() => ({
  answers: new Map<string, Array<Array<string>>>(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: async (hostname: string) => {
    const answers = dns.answers.get(hostname) ?? []
    const addresses = answers.length > 1 ? answers.shift() : answers[0]
    if (!addresses) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`)
    return addresses.map((address) => ({
      address,
      family: address.includes(':') ? 6 : 4,
    }))
  },
}))

/** `host` resolves to `answers`, one answer a lookup. */
function resolves(host: string, ...answers: Array<Array<string>>) {
  dns.answers.set(host, answers)
}

const PUBLIC_IP = '93.184.216.34'
const MB5 = 5 * 1024 * 1024
const REFUSED = 'webfetch does not read private or local hosts'

type Route = (init: RequestInit | undefined) => Response | Promise<Response>

/** A route that answers with `body` and the `content-type` `type`. */
function page(body: BodyInit, type: string) {
  return () => new Response(body, { headers: { 'content-type': type } })
}

/** A route that redirects to `location`. */
function redirect(location: string) {
  return () => new Response(null, { status: 302, headers: { location } })
}

/** A fetch that answers from `routes`, by URL. `urls` lists each fetch. */
function fakeFetch(routes: Record<string, Route>) {
  const urls: Array<string> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input)
    urls.push(url)
    const route = routes[url]
    if (!route) throw new Error(`No route for ${url}`)
    return route(init)
  }
  return { fetch, urls }
}

/** Run the tool `name` from `webTools(options)` once. */
async function run(name: string, args: object, options: WebToolsOptions = {}) {
  const tool = webTools(options).find((item) => item.name === name)
  if (!tool?.execute) throw new Error(`No ${name} tool`)
  return tool.execute(args)
}

/** Fetch `url` with a fetch that knows `routes`. */
function webfetch(
  args: { url: string; format?: string; timeoutMs?: number },
  routes: Record<string, Route>,
  options: WebToolsOptions = {},
) {
  const { fetch } = fakeFetch(routes)
  return run('webfetch', args, { fetch, ...options })
}

beforeEach(() => {
  dns.answers.clear()
  resolves('example.com', [PUBLIC_IP])
})

describe('webfetch formats', () => {
  const html =
    '<html><head><title>Doc</title><style>p { color: red }</style></head><body><h1>Hello</h1><p>Tom &amp; <strong>Jerry</strong> &lt;3 &#x41;&#66;</p><script>alert("x")</script></body></html>'
  const routes = { 'https://example.com/': page(html, 'text/html; charset=utf-8') }

  it('gives back HTML as markdown when turndown is installed', async () => {
    const result = await webfetch({ url: 'https://example.com/' }, routes)
    expect(result).toBe('Doc\n\n# Hello\n\nTom & **Jerry** <3 AB')
  })

  it('gives back text without tags, scripts, or styles', async () => {
    const result = await webfetch(
      { url: 'https://example.com/', format: 'text' },
      routes,
    )
    expect(result).toBe('Doc\nHello\nTom & Jerry <3 AB')
  })

  it('gives back the HTML as is with format html', async () => {
    const result = await webfetch(
      { url: 'https://example.com/', format: 'html' },
      routes,
    )
    expect(result).toBe(html)
  })

  it('gives back JSON as it is', async () => {
    const result = await webfetch(
      { url: 'https://example.com/data' },
      { 'https://example.com/data': page('{"ok":true}', 'application/json') },
    )
    expect(result).toBe('{"ok":true}')
  })

  it('without turndown, refuses markdown and gives text by default', async () => {
    vi.doMock('turndown', () => {
      throw new Error('Cannot find package turndown')
    })
    try {
      await expect(
        webfetch({ url: 'https://example.com/', format: 'markdown' }, routes),
      ).rejects.toThrow('Install turndown to get markdown')
      const result = await webfetch({ url: 'https://example.com/' }, routes)
      expect(result).toBe('Doc\nHello\nTom & Jerry <3 AB')
    } finally {
      vi.doUnmock('turndown')
    }
  })
})

describe('webfetch limits', () => {
  it('stops reading at 5 MB and says the page was cut', async () => {
    const body = 'a'.repeat(MB5 + 100)
    const result = await webfetch(
      { url: 'https://example.com/big.txt' },
      { 'https://example.com/big.txt': page(body, 'text/plain') },
    )
    expect(result).toBe(
      `${'a'.repeat(MB5)}\n\n[Cut at 5 MB. The rest was not read.]`,
    )
  })

  it('stops after the timeout', async () => {
    const hang: Route = (init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        )
      })
    await expect(
      webfetch(
        { url: 'https://example.com/slow', timeoutMs: 20 },
        { 'https://example.com/slow': hang },
      ),
    ).rejects.toThrow('https://example.com/slow timed out after 20 ms.')
  })

  it('refuses binary content', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    await expect(
      webfetch(
        { url: 'https://example.com/logo.png' },
        { 'https://example.com/logo.png': page(png, 'image/png') },
      ),
    ).rejects.toThrow(
      'https://example.com/logo.png is image/png. webfetch reads HTML, text, and JSON only.',
    )
  })

  it('refuses a body with no content type and a NUL byte', async () => {
    const bytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01])
    await expect(
      webfetch(
        { url: 'https://example.com/tool' },
        { 'https://example.com/tool': () => new Response(bytes) },
      ),
    ).rejects.toThrow('https://example.com/tool is binary.')
  })

  it('fails on an HTTP error status', async () => {
    await expect(
      webfetch(
        { url: 'https://example.com/missing' },
        {
          'https://example.com/missing': () =>
            new Response('gone', { status: 404 }),
        },
      ),
    ).rejects.toThrow('https://example.com/missing answered with HTTP 404.')
  })
})

describe('webfetch hosts', () => {
  it.each([
    'http://localhost:3000/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.8/',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[::ffff:127.0.0.1]/',
  ])('refuses %s without fetching it', async (url) => {
    const { fetch, urls } = fakeFetch({})
    await expect(run('webfetch', { url }, { fetch })).rejects.toThrow(REFUSED)
    expect(urls).toEqual([])
  })

  it('refuses a name when DNS gives a private address', async () => {
    resolves('intranet.example', [PUBLIC_IP, '10.1.2.3'])
    const { fetch, urls } = fakeFetch({})
    await expect(
      run('webfetch', { url: 'https://intranet.example/' }, { fetch }),
    ).rejects.toThrow(`${REFUSED}: intranet.example`)
    expect(urls).toEqual([])
  })

  it('refuses a name that DNS cannot resolve', async () => {
    await expect(
      webfetch({ url: 'https://nowhere.example/' }, {}),
    ).rejects.toThrow('Could not resolve nowhere.example.')
  })

  it('reads private hosts with allowPrivateHosts', async () => {
    const result = await webfetch(
      { url: 'http://localhost:3000/' },
      { 'http://localhost:3000/': page('local', 'text/plain') },
      { allowPrivateHosts: true },
    )
    expect(result).toBe('local')
  })

  it('refuses a URL that is not http or https', async () => {
    await expect(
      webfetch({ url: 'file:///etc/passwd' }, {}, { allowPrivateHosts: true }),
    ).rejects.toThrow('webfetch reads http and https URLs only, not file:')
  })
})

describe('webfetch redirects', () => {
  it('follows a redirect to a public host', async () => {
    const { fetch, urls } = fakeFetch({
      'https://example.com/old': redirect('/new'),
      'https://example.com/new': page('moved', 'text/plain'),
    })
    const result = await run(
      'webfetch',
      { url: 'https://example.com/old' },
      { fetch },
    )
    expect(result).toBe('moved')
    expect(urls).toEqual(['https://example.com/old', 'https://example.com/new'])
  })

  it('refuses a redirect to a private host', async () => {
    const { fetch, urls } = fakeFetch({
      'https://example.com/go': redirect('http://169.254.169.254/latest/'),
    })
    await expect(
      run('webfetch', { url: 'https://example.com/go' }, { fetch }),
    ).rejects.toThrow(`${REFUSED}: 169.254.169.254`)
    expect(urls).toEqual(['https://example.com/go'])
  })

  it('stops after 5 redirects', async () => {
    const { fetch, urls } = fakeFetch({
      'https://example.com/loop': redirect('/loop'),
    })
    await expect(
      run('webfetch', { url: 'https://example.com/loop' }, { fetch }),
    ).rejects.toThrow('https://example.com/loop redirected more than 5 times.')
    expect(urls).toHaveLength(6)
  })
})

describe('webfetch without a custom fetch', () => {
  // A real server on 127.0.0.1. `paths` lists the requests that reach it.
  const paths: Array<string> = []
  const server = createServer((req, res) => {
    paths.push(req.url ?? '')
    if (req.url === '/old') {
      res.writeHead(302, { location: '/new' }).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' }).end('hello')
  })
  let port = 0

  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address: AddressInfo | string | null = server.address()
    port = typeof address === 'object' && address ? address.port : 0
  })

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()))
  })

  beforeEach(() => {
    paths.length = 0
  })

  it('refuses a name whose answer turns private when it connects', async () => {
    // The check sees a public address. The connection sees 127.0.0.1.
    resolves('rebind.test', [PUBLIC_IP], ['127.0.0.1'])
    await expect(
      run('webfetch', { url: `http://rebind.test:${port}/` }),
    ).rejects.toThrow(`${REFUSED}: rebind.test`)
    expect(paths).toEqual([])
  })

  it('reaches a private host with allowPrivateHosts and follows redirects', async () => {
    resolves('rebind.test', ['127.0.0.1'])
    const result = await run(
      'webfetch',
      { url: `http://rebind.test:${port}/old` },
      { allowPrivateHosts: true },
    )
    expect(result).toBe('hello')
    expect(paths).toEqual(['/old', '/new'])
  })
})

describe('websearch', () => {
  /** A provider that gives back `results` and records each search. */
  function provider(results: Awaited<ReturnType<SearchProvider['search']>>) {
    const searches: Array<{ query: string; limit: number }> = []
    const search: SearchProvider = {
      search: async (query, { limit }) => {
        searches.push({ query, limit })
        return results
      },
    }
    return { search, searches }
  }

  it('gives back the results as a numbered list', async () => {
    const { search, searches } = provider([
      {
        title: 'TanStack AI',
        url: 'https://tanstack.com/ai',
        snippet: 'Type-safe AI SDK',
      },
      { title: 'TanStack Query', url: 'https://tanstack.com/query' },
    ])
    const result = await run(
      'websearch',
      { query: 'tanstack', limit: 2 },
      { search },
    )
    expect(result).toBe(
      '1. TanStack AI\n   https://tanstack.com/ai\n   Type-safe AI SDK\n\n2. TanStack Query\n   https://tanstack.com/query',
    )
    expect(searches).toEqual([{ query: 'tanstack', limit: 2 }])
  })

  it('says when there are no results', async () => {
    const { search } = provider([])
    const result = await run('websearch', { query: 'nothing' }, { search })
    expect(result).toBe('No results for "nothing".')
  })

  it('exists only with a provider', () => {
    const { search } = provider([])
    const names = (options: WebToolsOptions) =>
      webTools(options).map((tool) => tool.name)
    expect(names({})).toEqual(['webfetch'])
    expect(names({ search })).toEqual(['webfetch', 'websearch'])
  })
})
