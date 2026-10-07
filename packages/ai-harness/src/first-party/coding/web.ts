import { lookup } from 'node:dns/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import { BlockList, isIP } from 'node:net'
import { toolDefinition } from '@tanstack/ai'
import { isRecord } from '../../utils'
import { optionalString, stringArg } from './backend'
import type { IncomingMessage } from 'node:http'
import type { LookupFunction } from 'node:net'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
/** `webfetch` stops reading a body after this many bytes. */
const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5
/** A NUL byte in this many first bytes marks a binary body. */
const BINARY_CHECK_BYTES = 8 * 1024
const DEFAULT_RESULTS = 8
const MAX_RESULTS = 20

const FORMATS = ['markdown', 'text', 'html'] as const
type Format = (typeof FORMATS)[number]

const HTML_TYPES = /^(text\/html|application\/xhtml\+xml)$/
const TEXT_TYPES = /^text\/|[/+](json|xml)$|javascript$/

/** The part of `turndown` that `webfetch` uses. It ships no types. */
type TurndownClass = new (options: {
  headingStyle: 'atx'
  codeBlockStyle: 'fenced'
}) => {
  remove: (tags: Array<string>) => unknown
  turndown: (html: string) => string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** The addresses that are not on the public internet. */
const PRIVATE = new BlockList()
// This network. 0.0.0.0 reaches this machine.
PRIVATE.addSubnet('0.0.0.0', 8)
PRIVATE.addSubnet('10.0.0.0', 8)
// Shared address space. Some clouds keep metadata here.
PRIVATE.addSubnet('100.64.0.0', 10)
PRIVATE.addSubnet('127.0.0.0', 8)
// Link-local, with the cloud metadata address 169.254.169.254.
PRIVATE.addSubnet('169.254.0.0', 16)
PRIVATE.addSubnet('172.16.0.0', 12)
PRIVATE.addSubnet('192.168.0.0', 16)
// Multicast and reserved.
PRIVATE.addSubnet('224.0.0.0', 3)
// `::`, `::1`, and IPv4 in the old `::a.b.c.d` form. The IPv4 rules above
// also match the `::ffff:a.b.c.d` form.
PRIVATE.addSubnet('::', 96, 'ipv6')
PRIVATE.addSubnet('fc00::', 7, 'ipv6')
PRIVATE.addSubnet('fe80::', 10, 'ipv6')
PRIVATE.addSubnet('ff00::', 8, 'ipv6')

/** A search engine for the `websearch` tool. */
export interface SearchProvider {
  /** At most `options.limit` results for `query`. */
  search: (
    query: string,
    options: { limit: number; signal?: AbortSignal },
  ) => Promise<Array<{ title: string; url: string; snippet?: string }>>
}

export interface WebToolsOptions {
  /**
   * The `fetch` that `webfetch` uses. Default: a request with `node:http`
   * and `node:https` that checks the address of each connection. A custom
   * `fetch` looks up host names itself. Then a DNS server that changes its
   * answer after the check (DNS rebinding) can reach a private host.
   */
  fetch?: typeof fetch
  /**
   * Let `webfetch` read localhost and private network hosts. Default:
   * `false`. Turn it on only when the model may reach your network.
   */
  allowPrivateHosts?: boolean
  /** Adds the `websearch` tool. Without it, there is no `websearch` tool. */
  search?: SearchProvider
}

/** The `turndown` class, or `undefined` when that optional peer is missing. */
async function loadTurndown() {
  try {
    // @ts-expect-error -- turndown ships no types. TurndownClass is the part we use.
    const turndown: { default: TurndownClass } = await import('turndown')
    return turndown.default
  } catch {
    return undefined
  }
}

/** Decode `&amp;`, `&lt;`, `&#39;`, `&#x41;`, and the other common entities. */
function decodeEntities(text: string) {
  return text.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (!name.startsWith('#')) return ENTITIES[name.toLowerCase()] ?? entity
      const isHex = name[1] === 'x' || name[1] === 'X'
      const code = Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity
    },
  )
}

/** The text of an HTML page: no tags, scripts, or styles. One block a line. */
function htmlToText(html: string) {
  const text = html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
  return decodeEntities(text)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n\s*/g, '\n')
    .trim()
}

/** `html` in the format the model asked for. */
async function convert(html: string, format: Format | undefined) {
  const Turndown = await loadTurndown()
  const wanted = format ?? (Turndown ? 'markdown' : 'text')
  switch (wanted) {
    case 'html':
      return html
    case 'text':
      return htmlToText(html)
    case 'markdown': {
      if (!Turndown) {
        throw new Error(
          'Install turndown to get markdown (npm install turndown), or ask for format "text".',
        )
      }
      const service = new Turndown({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      })
      service.remove(['script', 'style', 'noscript', 'template'])
      return service.turndown(html)
    }
  }
}

/** The `format` argument, or `undefined` when the model did not set it. */
function formatArg(args: unknown) {
  const value = optionalString(args, 'format')
  if (value === undefined) return undefined
  const format = FORMATS.find((item) => item === value)
  if (format === undefined) {
    throw new Error('Argument "format" must be markdown, text, or html.')
  }
  return format
}

/** True when `address`, an IP address, is not on the public internet. */
function isPrivateAddress(address: string) {
  return PRIVATE.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4')
}

/** The error for a host that `webfetch` does not read. */
function refused(host: string) {
  return new Error(`webfetch does not read private or local hosts: ${host}`)
}

/**
 * Throws unless `url` is http or https. Unless `allowPrivateHosts` is set,
 * it also throws for a private or local host: the host as written, and
 * every address that DNS gives for it. The default request checks the
 * addresses again when it connects.
 */
async function checkUrl(url: URL, allowPrivateHosts: boolean) {
  const isWeb = url.protocol === 'http:' || url.protocol === 'https:'
  if (!isWeb) {
    throw new Error(
      `webfetch reads http and https URLs only, not ${url.protocol}`,
    )
  }
  if (allowPrivateHosts) return
  // The URL keeps IPv6 hosts in brackets. A name can end with a dot.
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const isLocalName = host === 'localhost' || host.endsWith('.localhost')
  if (isLocalName) throw refused(url.hostname)
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw refused(url.hostname)
    return
  }
  const addresses = await lookup(host, { all: true }).catch(() => {
    throw new Error(`Could not resolve ${host}.`)
  })
  const isPrivate = addresses.some(({ address }) => isPrivateAddress(address))
  if (isPrivate) throw refused(url.hostname)
}

/**
 * A `lookup` for Node sockets. It refuses `hostname` when any of its
 * addresses is private, unless `allowPrivateHosts` is set. The socket
 * connects only to the addresses that were checked here, so a DNS answer
 * that changes after `checkUrl` cannot reach a private host.
 */
function checkedLookup(allowPrivateHosts: boolean) {
  const checked: LookupFunction = (hostname, options, callback) => {
    void lookup(hostname, { ...options, all: true }).then(
      (addresses) => {
        const isPrivate =
          !allowPrivateHosts &&
          addresses.some(({ address }) => isPrivateAddress(address))
        const [first] = addresses
        if (isPrivate) callback(refused(hostname), [])
        else if (options.all) callback(null, addresses)
        else if (first) callback(null, first.address, first.family)
        else callback(new Error(`Could not resolve ${hostname}.`), [])
      },
      (error) => callback(error, []),
    )
  }
  return checked
}

/**
 * A Node response as a fetch `Response`. Only the headers that `webfetch`
 * reads are copied. The body is read from the socket on demand.
 */
function toResponse(response: IncomingMessage) {
  const status = response.statusCode ?? 500
  const headers = new Headers()
  const { location, 'content-type': type } = response.headers
  if (location !== undefined) headers.set('location', location)
  if (type !== undefined) headers.set('content-type', type)
  const hasNoBody = status === 204 || status === 205 || status === 304
  if (hasNoBody) {
    response.resume()
    return new Response(null, { status, headers })
  }
  // The chunks are Buffers, so the stream gives Uint8Array chunks.
  const chunks = response[Symbol.asyncIterator]()
  const body = new ReadableStream({
    pull: async (controller) => {
      const next = await chunks.next()
      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
    cancel: () => {
      response.destroy()
    },
  })
  return new Response(body, { status, headers })
}

/**
 * GET `url` with `node:http` or `node:https`. It never follows redirects.
 * Each request gets its own connection (`agent: false`), so every
 * connection goes through `checkedLookup`.
 */
async function request(
  url: URL,
  options: { signal: AbortSignal; allowPrivateHosts: boolean },
) {
  const settings = {
    agent: false,
    signal: options.signal,
    lookup: checkedLookup(options.allowPrivateHosts),
  }
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const sent =
      url.protocol === 'https:'
        ? https.get(url, settings, resolve)
        : http.get(url, settings, resolve)
    sent.on('error', reject)
  })
  return toResponse(response)
}

/**
 * Fetch `start` with `send` and follow at most 5 redirects. Each URL is
 * checked before it is sent, so a redirect cannot lead to a private host.
 */
async function follow(
  start: URL,
  options: {
    send: (url: URL) => Promise<Response>
    allowPrivateHosts: boolean
  },
) {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await checkUrl(url, options.allowPrivateHosts)
    const response = await options.send(url)
    const location = response.headers.get('location')
    const isRedirect =
      response.status >= 300 && response.status < 400 && location !== null
    if (!isRedirect) return { response, url }
    await response.body?.cancel()
    url = new URL(location, url)
  }
  throw new Error(`${start.href} redirected more than ${MAX_REDIRECTS} times.`)
}

/** The body bytes, at most 5 MB. `isCut` is true when there was more. */
async function readBody(response: Response) {
  const reader = response.body?.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  let isCut = false
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    if (size > MAX_BYTES) {
      isCut = true
      await reader.cancel()
      break
    }
  }
  return { bytes: Buffer.concat(chunks).subarray(0, MAX_BYTES), isCut }
}

/** The page as the model gets it: HTML converted, text and JSON as they are. */
async function readPage(
  response: Response,
  url: URL,
  format: Format | undefined,
) {
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`${url.href} answered with HTTP ${response.status}.`)
  }
  const header = response.headers.get('content-type') ?? ''
  const type = (header.split(';', 1)[0] ?? '').trim().toLowerCase()
  const isHtml = HTML_TYPES.test(type)
  const binary = `${url.href} is ${type || 'binary'}. webfetch reads HTML, text, and JSON only.`
  // A missing type is checked on the bytes below.
  const isKnownBinary = type !== '' && !isHtml && !TEXT_TYPES.test(type)
  if (isKnownBinary) {
    await response.body?.cancel()
    throw new Error(binary)
  }
  const { bytes, isCut } = await readBody(response)
  if (type === '' && bytes.subarray(0, BINARY_CHECK_BYTES).includes(0)) {
    throw new Error(binary)
  }
  // ponytail: reads every page as UTF-8. Decode the charset of the
  // content type if other charsets matter.
  const text = new TextDecoder().decode(bytes)
  const page = isHtml ? await convert(text, format) : text
  return isCut ? `${page}\n\n[Cut at 5 MB. The rest was not read.]` : page
}

/**
 * The web tools for a coding agent:
 *
 * - `webfetch` reads a URL. HTML comes back as Markdown when the optional
 *   `turndown` package is installed, else as text. Text and JSON come back
 *   as they are. Other content types are refused. It reads at most 5 MB,
 *   stops after 30 seconds (the model can ask for up to 120), and follows
 *   at most 5 redirects.
 * - `websearch` searches with `options.search`. Without a provider, there
 *   is no `websearch` tool.
 *
 * `webfetch` fetches URLs that the model picks. So it reads only http and
 * https, and it refuses localhost, loopback, link-local (with cloud
 * metadata), and private network hosts, unless `allowPrivateHosts` is set.
 * Without `options.fetch`, it checks the address of each connection, so a
 * DNS answer that changes after the check cannot reach a private host.
 *
 * @example
 * ```ts
 * const tools = webTools({
 *   search: { search: (query, { limit }) => mySearch(query, limit) },
 * })
 * ```
 */
export function webTools(options: WebToolsOptions = {}) {
  const { allowPrivateHosts = false, search } = options

  const webfetch = toolDefinition({
    name: 'webfetch',
    description:
      'Read a web page by its http or https URL. HTML comes back as Markdown by default, or set format to text or html. Text and JSON come back as they are. At most 5 MB is read.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        format: { type: 'string', enum: ['markdown', 'text', 'html'] },
        timeoutMs: {
          type: 'number',
          description: 'Stop after this many milliseconds. At most 120000.',
        },
      },
      required: ['url'],
    },
    replay: 'safe',
  }).server(async (args: unknown, context) => {
    const url = new URL(stringArg(args, 'url'))
    const format = formatArg(args)
    const requested = isRecord(args) ? args.timeoutMs : undefined
    // A timeout of 0 would stop at once, so it gets the default.
    const isTimeout = typeof requested === 'number' && requested > 0
    const timeoutMs = isTimeout
      ? Math.min(requested, MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS
    const timeout = AbortSignal.timeout(timeoutMs)
    const runSignal = context?.abortSignal
    const signal = runSignal ? AbortSignal.any([timeout, runSignal]) : timeout
    const customFetch = options.fetch
    const send = customFetch
      ? (target: URL) =>
          customFetch(target.href, { redirect: 'manual', signal })
      : (target: URL) => request(target, { signal, allowPrivateHosts })
    try {
      const fetched = await follow(url, { send, allowPrivateHosts })
      return await readPage(fetched.response, fetched.url, format)
    } catch (error) {
      if (timeout.aborted) {
        throw new Error(`${url.href} timed out after ${timeoutMs} ms.`)
      }
      throw error
    }
  })

  if (!search) return [webfetch]

  const websearch = toolDefinition({
    name: 'websearch',
    description:
      'Search the web. You get a numbered list of results: title, URL, and a short snippet. Read a result with webfetch.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: {
          type: 'number',
          description: `Most results to get. Default ${DEFAULT_RESULTS}, at most ${MAX_RESULTS}.`,
        },
      },
      required: ['query'],
    },
    replay: 'safe',
  }).server(async (args: unknown, context) => {
    const query = stringArg(args, 'query')
    const requested = isRecord(args) ? args.limit : undefined
    const isLimit = typeof requested === 'number' && requested >= 1
    const limit = isLimit
      ? Math.min(Math.floor(requested), MAX_RESULTS)
      : DEFAULT_RESULTS
    const results = await search.search(query, {
      limit,
      signal: context?.abortSignal,
    })
    if (results.length === 0) return `No results for "${query}".`
    return results
      .slice(0, limit)
      .map((result, index) => {
        const lines = [`${index + 1}. ${result.title}`, `   ${result.url}`]
        if (result.snippet) lines.push(`   ${result.snippet}`)
        return lines.join('\n')
      })
      .join('\n\n')
  })

  return [webfetch, websearch]
}
