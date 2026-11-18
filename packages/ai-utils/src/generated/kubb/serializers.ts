export type HeaderValue = string | number | boolean | null | undefined | object
export type HeadersInit =
  | Array<[string, HeaderValue]>
  | Record<string, HeaderValue>

/**
 * The request body type `fetch` accepts, derived from `RequestInit` instead of the global `BodyInit`
 * name, which a Node-only project (`@types/node` without the `dom` lib) does not declare.
 */
export type RequestBody = NonNullable<RequestInit['body']>

export type HttpMethod =
  | 'GET'
  | 'PUT'
  | 'PATCH'
  | 'POST'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD'
  | 'QUERY'

/**
 * The OpenAPI query-parameter serialization style. `form` is the default; `spaceDelimited` and
 * `pipeDelimited` join arrays with a space or pipe, and `deepObject` renders objects as
 * `key[prop]=value`.
 */
export type QueryStyle =
  | 'form'
  | 'spaceDelimited'
  | 'pipeDelimited'
  | 'deepObject'

/**
 * The serialization metadata shared by the styled parameter locations: the OpenAPI `style` (typed per
 * location through `TStyle`), `explode`, and `allowReserved` (keeps RFC 3986 reserved characters
 * unencoded, used by query and request bodies).
 */
export type SerializationStyle<TStyle = string> = {
  style?: TStyle
  explode?: boolean
  allowReserved?: boolean
}

/** The media type of a parameter described with `content`; JSON sends one JSON-encoded value. */
export type ParamContentType = {
  contentType?: string
}

/**
 * The per-parameter query serialization metadata carried by the generated request. `querystring` marks an OpenAPI 3.2
 * `in: querystring` parameter, whose JSON value is the whole query string, sent without its name.
 */
export type QueryParamStyle = SerializationStyle<QueryStyle> &
  ParamContentType & { querystring?: boolean }

/**
 * Serializes the query object into a search string. The optional second argument carries the
 * per-parameter OpenAPI `style` / `explode` / `allowReserved` metadata; without it arrays explode
 * into repeated keys and nested objects use the `deepObject` style.
 */
export type QuerySerializer = (
  params: Record<string, unknown>,
  options?: Record<string, QueryParamStyle>,
) => string

/**
 * The per-parameter cookie serialization metadata carried by the generated request. Cookies use the
 * OpenAPI `form` style, so only `explode` is configurable.
 */
export type CookieParamStyle = ParamContentType & {
  explode?: boolean
}

/**
 * The per-parameter header serialization metadata carried by the generated request. Headers use the
 * OpenAPI `simple` style, so only `explode` is configurable.
 *
 * @example
 * ```ts
 * // styles.header: { 'X-Ids': { explode: false } }, header [3, 4] -> 'X-Ids: 3,4'
 * // styles.header: { 'X-Filter': { explode: true } }, header { role: 'admin' } -> 'X-Filter: role=admin'
 * ```
 */
export type HeaderParamStyle = ParamContentType & {
  explode?: boolean
}

/**
 * The per-property `encoding` metadata for an `application/x-www-form-urlencoded` or
 * `multipart/form-data` request body. `contentType` overrides the part's media type; `style` /
 * `explode` / `allowReserved` follow the OpenAPI query rules for urlencoded bodies.
 */
export type BodyEncoding = SerializationStyle<QueryStyle> & {
  contentType?: string
}

/**
 * Serializes the request body. JSON by default; `FormData`, `URLSearchParams`, `Blob`,
 * `ArrayBuffer`, and string bodies pass through untouched. The optional `encoding` argument carries
 * the per-property OpenAPI `encoding` metadata for form bodies.
 */
export type BodySerializer = (args: {
  body: unknown
  contentType?: string
  encoding?: Record<string, BodyEncoding>
}) => RequestBody | undefined

/**
 * The OpenAPI path-parameter serialization style. `simple` is the default and emits the bare value;
 * `label` prefixes a `.` and `matrix` prefixes a `;name=` segment.
 */
export type PathStyle = 'simple' | 'label' | 'matrix'

/**
 * The per-parameter serialization metadata carried by the generated request. `style` selects the
 * OpenAPI style and `explode` controls how arrays and objects expand.
 */
export type PathParamStyle = SerializationStyle<PathStyle>

/**
 * Serializes a single path parameter for interpolation into the URL, honoring the OpenAPI `style` /
 * `explode` passed as `options`. Defaults to `simple` style with `explode: false`: primitives are
 * URL-encoded, arrays join their members with commas, and objects flatten to `key,value` pairs.
 */
export type PathSerializer = (args: {
  name: string
  value: unknown
  options?: PathParamStyle
}) => string

/**
 * The per-concern serializers, grouped so they can be set in one place and overridden per client or
 * per call. Each field falls back to the matching `default*Serializer` when omitted.
 */
export type Serializers = {
  query?: QuerySerializer
  body?: BodySerializer
  path?: PathSerializer
}

/**
 * The per-parameter OpenAPI `style` / `explode` metadata a generated request carries, grouped by
 * location and keyed by parameter name. Mirrors the `serializer` grouping and feeds the default
 * serializers; `body` carries the form `encoding` for a urlencoded or multipart body.
 */
export type Styles = {
  path?: Record<string, PathParamStyle>
  query?: Record<string, QueryParamStyle>
  header?: Record<string, HeaderParamStyle>
  cookie?: Record<string, CookieParamStyle>
  body?: Record<string, BodyEncoding>
}

function isFormBody(body: unknown): body is RequestBody {
  return (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    typeof body === 'string'
  )
}

export function isDefaultJsonBody(body: unknown): boolean {
  return body !== undefined && body !== null && !isFormBody(body)
}

/**
 * Emits a `bigint` (`format: int64`) as a JSON number, which `JSON.stringify` refuses to do itself.
 * Past the safe-integer range it throws, so an id never goes out silently truncated.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== 'bigint') return value
  if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER)
    throw new TypeError(
      `Cannot serialize ${value}n as JSON without losing precision, register a serializer.body to send it another way.`,
    )
  return Number(value)
}

function appendFormDataValue({
  formData,
  key,
  value,
  contentType,
}: {
  formData: FormData
  key: string
  value: unknown
  contentType?: string
}): void {
  if (value === undefined || value === null) return
  if (value instanceof Blob) {
    formData.append(key, value)
    return
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const json = JSON.stringify(value, jsonReplacer)
    // A part's media type can only be set by wrapping the value in a typed Blob.
    formData.append(
      key,
      contentType ? new Blob([json], { type: contentType }) : json,
    )
    return
  }
  formData.append(key, toValue(value))
}

/**
 * Default body serializer: passes binary/form bodies through and JSON-serializes everything else.
 * For `multipart/form-data` plain objects become `FormData` and for
 * `application/x-www-form-urlencoded` they become `URLSearchParams`. When `encoding` is supplied each
 * urlencoded property follows its OpenAPI `style` / `explode` / `allowReserved`.
 *
 * @example
 * ```ts
 * defaultBodySerializer({ body: { name: 'odie' } }) // '{"name":"odie"}'
 * defaultBodySerializer({ body: { field: 'x' }, contentType: 'multipart/form-data' }) // FormData
 * defaultBodySerializer({ body: { tags: ['a', 'b'] }, contentType: 'application/x-www-form-urlencoded', encoding: { tags: { explode: false } } }) // 'tags=a,b'
 * defaultBodySerializer({ body: { meta: { a: 1 } }, contentType: 'multipart/form-data', encoding: { meta: { contentType: 'application/json' } } }) // FormData with a typed Blob part
 * ```
 */
export const defaultBodySerializer: BodySerializer = ({
  body,
  contentType,
  encoding,
}) => {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string' && isJsonMediaType(contentType))
    return JSON.stringify(body)
  if (isFormBody(body)) return body as RequestBody
  const normalizedContentType = contentType?.toLowerCase()
  if (normalizedContentType?.includes('multipart/form-data')) {
    const formData = new FormData()
    for (const [key, value] of Object.entries(
      body as Record<string, unknown>,
    )) {
      const partContentType = encoding?.[key]?.contentType
      if (Array.isArray(value)) {
        for (const item of value)
          appendFormDataValue({
            formData,
            key,
            value: item,
            contentType: partContentType,
          })
        continue
      }
      appendFormDataValue({
        formData,
        key,
        value,
        contentType: partContentType,
      })
    }
    return formData
  }
  if (normalizedContentType?.includes('application/x-www-form-urlencoded')) {
    if (encoding)
      return serializeUrlencodedBody(body as Record<string, unknown>, encoding)
    return new URLSearchParams(
      serializeUrlencodedBody(body as Record<string, unknown>, {}),
    )
  }
  return JSON.stringify(body, jsonReplacer)
}

function serializeUrlencodedBody(
  body: Record<string, unknown>,
  encoding: Record<string, BodyEncoding>,
): string {
  const parts: Array<string> = []
  for (const [key, value] of Object.entries(body)) {
    const propertyEncoding = encoding[key]
    parts.push(
      ...(propertyEncoding
        ? serializeStyledQueryParam({ key, value, options: propertyEncoding })
        : serializeDefaultQueryParam(key, value)),
    )
  }
  return parts.join('&')
}

/**
 * The media type of a `Content-Type` value without its parameters, in lower case: `application/json; charset=utf-8` gives `application/json`.
 */
export function baseContentType(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined
  return value.split(';')[0]!.trim().toLowerCase() || undefined
}

/** Whether a content type carries JSON: `application/json`, `text/json`, or a `+json` suffix. */
export function isJsonMediaType(
  contentType: string | null | undefined,
): boolean {
  return /[/+]json$/.test(baseContentType(contentType) ?? '')
}

function serializeCookie({
  name,
  value,
  explode,
}: {
  name: string
  value: unknown
  explode: boolean
}): string {
  if (Array.isArray(value)) {
    const items = value
      .filter(notNullish)
      .map((item) => encodeURIComponent(toValue(item)))
    return explode
      ? items.map((item) => `${name}=${item}`).join('; ')
      : `${name}=${items.join(',')}`
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, item]) => notNullish(item))
    if (explode)
      return entries
        .map(([key, item]) => `${key}=${encodeURIComponent(toValue(item))}`)
        .join('; ')
    return `${name}=${entries
      .flatMap(([key, item]) => [key, item])
      .map((item) => encodeURIComponent(toValue(item)))
      .join(',')}`
  }
  return `${name}=${encodeURIComponent(toValue(value))}`
}

/**
 * Serializes cookie parameters into a `Cookie` header value using the OpenAPI `form` style, joined
 * with `; `. Values are URL-encoded and `explode` is honored per parameter.
 *
 * @example
 * ```ts
 * serializeCookies({ session: 'abc', ids: [1, 2] }) // 'session=abc; ids=1,2'
 * serializeCookies({ ids: [1, 2] }, { ids: { explode: true } }) // 'ids=1; ids=2'
 * ```
 */
export function serializeCookies(
  cookies: Record<string, unknown>,
  styles?: Record<string, CookieParamStyle>,
): string {
  const parts: Array<string> = []
  for (const [name, value] of Object.entries(cookies)) {
    if (value === undefined || value === null) continue
    const style = styles?.[name]
    if (isJsonMediaType(style?.contentType)) {
      parts.push(
        `${name}=${encodeURIComponent(JSON.stringify(value, jsonReplacer))}`,
      )
      continue
    }
    parts.push(
      serializeCookie({ name, value, explode: style?.explode ?? false }),
    )
  }
  return parts.join('; ')
}

function appendQueryValue({
  search,
  key,
  value,
}: {
  search: URLSearchParams
  key: string
  value: unknown
}): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue({ search, key, value: item })
    return
  }
  if (isRecord(value)) {
    for (const [prop, propValue] of Object.entries(value)) {
      appendQueryValue({ search, key: `${key}[${prop}]`, value: propValue })
    }
    return
  }
  search.append(key, toValue(value))
}

const queryDelimiters: Record<QueryStyle, string> = {
  form: ',',
  spaceDelimited: '%20',
  pipeDelimited: '|',
  deepObject: ',',
}

function notNullish(value: unknown): boolean {
  return value !== undefined && value !== null
}

/**
 * Renders a primitive parameter value as a string, serializing `Date` to ISO-8601 so dates are
 * stable across path, query, cookie, and header locations rather than locale-dependent.
 */
function toValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * Percent-encodes a value, keeping RFC 3986 reserved characters intact (used when `allowReserved` is set).
 */
function encodeReserved(value: unknown): string {
  return encodeURI(toValue(value))
}

/**
 * Percent-encodes a value, escaping reserved characters (the default query/path encoder).
 */
function encodeComponent(value: unknown): string {
  return encodeURIComponent(toValue(value))
}

/**
 * Whether a value should expand into bracketed/keyed parts. Arrays and `Date` are excluded so they
 * are serialized as a unit (a `Date` becomes an ISO string, not its enumerable own properties).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  )
}

/**
 * Expands an object or array into `deepObject` query parts, recursing into nested values so
 * `{ a: { b: { c: 1 } } }` becomes `a[b][c]=1`. Primitives terminate the recursion.
 */
function serializeDeepObject({
  key,
  value,
  encode,
}: {
  key: string
  value: unknown
  encode: (value: unknown) => string
}): Array<string> {
  if (value === undefined || value === null) return []
  if (Array.isArray(value))
    return value.flatMap((item, index) =>
      serializeDeepObject({ key: `${key}[${index}]`, value: item, encode }),
    )
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, item]) => notNullish(item))
      .flatMap(([prop, item]) =>
        serializeDeepObject({ key: `${key}[${prop}]`, value: item, encode }),
      )
  }
  return [`${encode(key)}=${encode(value)}`]
}

function serializeStyledQueryArray({
  key,
  value,
  options,
  encode,
}: {
  key: string
  value: Array<unknown>
  options: QueryParamStyle
  encode: (value: unknown) => string
}): Array<string> {
  const items = value.filter(notNullish)
  if (options.explode ?? true)
    return items.map((item) => `${encode(key)}=${encode(item)}`)
  return [
    `${encode(key)}=${items.map(encode).join(queryDelimiters[options.style ?? 'form'])}`,
  ]
}

function serializeStyledQueryObject({
  key,
  value,
  options,
  encode,
}: {
  key: string
  value: Record<string, unknown>
  options: QueryParamStyle
  encode: (value: unknown) => string
}): Array<string> {
  if ((options.style ?? 'form') === 'deepObject')
    return serializeDeepObject({ key, value, encode })
  const entries = Object.entries(value).filter(([, item]) => notNullish(item))
  if (options.explode ?? true)
    return entries.map(([prop, item]) => `${encode(prop)}=${encode(item)}`)
  return [
    `${encode(key)}=${entries
      .flatMap(([prop, item]) => [prop, item])
      .map(encode)
      .join(',')}`,
  ]
}

function serializeStyledQueryParam({
  key,
  value,
  options,
}: {
  key: string
  value: unknown
  options: QueryParamStyle
}): Array<string> {
  if (value === undefined || value === null) return []
  const encode = options.allowReserved ? encodeReserved : encodeComponent
  if (Array.isArray(value))
    return serializeStyledQueryArray({ key, value, options, encode })
  if (isRecord(value))
    return serializeStyledQueryObject({ key, value, options, encode })
  return [`${encode(key)}=${encode(value)}`]
}

function serializeDefaultQueryParam(
  key: string,
  value: unknown,
): Array<string> {
  const search = new URLSearchParams()
  appendQueryValue({ search, key, value })
  const result = search.toString()
  return result ? [result] : []
}

/**
 * Default query serializer. Members with `options` metadata follow their OpenAPI `style` / `explode`
 * / `allowReserved`. Members without it keep the defaults: arrays explode into repeated keys and
 * nested objects use the `deepObject` style (`key[prop]=value`).
 *
 * @example
 * ```ts
 * defaultQuerySerializer({ id: [3, 4, 5] }) // 'id=3&id=4&id=5'
 * defaultQuerySerializer({ id: [3, 4, 5] }, { id: { style: 'form', explode: false } }) // 'id=3,4,5'
 * defaultQuerySerializer({ id: [3, 4, 5] }, { id: { style: 'spaceDelimited', explode: false } }) // 'id=3%204%205'
 * defaultQuerySerializer({ id: [3, 4, 5] }, { id: { style: 'pipeDelimited', explode: false } }) // 'id=3|4|5'
 * defaultQuerySerializer({ a: { b: 1 } }, { a: { style: 'deepObject' } }) // 'a%5Bb%5D=1'
 * defaultQuerySerializer({ a: { b: { c: 1 } } }, { a: { style: 'deepObject' } }) // 'a%5Bb%5D%5Bc%5D=1'
 * ```
 */
export const defaultQuerySerializer: QuerySerializer = (params, options) => {
  const parts: Array<string> = []
  for (const [key, value] of Object.entries(params)) {
    const paramOptions = options?.[key]
    if (notNullish(value) && isJsonMediaType(paramOptions?.contentType)) {
      const json = encodeComponent(JSON.stringify(value, jsonReplacer))
      parts.push(
        paramOptions?.querystring ? json : `${encodeComponent(key)}=${json}`,
      )
      continue
    }
    parts.push(
      ...(paramOptions
        ? serializeStyledQueryParam({ key, value, options: paramOptions })
        : serializeDefaultQueryParam(key, value)),
    )
  }
  return parts.join('&')
}

function serializePathPrimitive({
  name,
  value,
  style,
}: {
  name: string
  value: unknown
  style: PathStyle
}): string {
  const encoded = encodeComponent(value)
  if (style === 'label') return `.${encoded}`
  if (style === 'matrix') return `;${name}=${encoded}`
  return encoded
}

function serializePathArray({
  name,
  value,
  style,
  explode,
}: {
  name: string
  value: Array<unknown>
  style: PathStyle
  explode: boolean
}): string {
  const items = value.map(encodeComponent)
  if (style === 'label') return `.${items.join(explode ? '.' : ',')}`
  if (style === 'matrix')
    return explode
      ? items.map((item) => `;${name}=${item}`).join('')
      : `;${name}=${items.join(',')}`
  return items.join(',')
}

function serializePathObject({
  name,
  value,
  style,
  explode,
}: {
  name: string
  value: Record<string, unknown>
  style: PathStyle
  explode: boolean
}): string {
  const members = Object.entries(value).map(([key, item]) =>
    explode
      ? `${encodeComponent(key)}=${encodeComponent(item)}`
      : `${encodeComponent(key)},${encodeComponent(item)}`,
  )
  if (style === 'label') return `.${members.join(explode ? '.' : ',')}`
  if (style === 'matrix')
    return explode
      ? members.map((member) => `;${member}`).join('')
      : `;${name}=${members.join(',')}`
  return members.join(',')
}

/**
 * Default path serializer honoring the OpenAPI `style` / `explode` metadata. Without metadata it
 * falls back to `simple` style with `explode: false`. Replaces the previous `String(value)`
 * interpolation, which emitted `[object Object]` for object path params.
 *
 * @example
 * ```ts
 * defaultPathSerializer({ name: 'id', value: [3, 4, 5] }) // '3,4,5'
 * defaultPathSerializer({ name: 'id', value: [3, 4, 5], options: { style: 'label', explode: true } }) // '.3.4.5'
 * defaultPathSerializer({ name: 'id', value: [3, 4, 5], options: { style: 'matrix', explode: true } }) // ';id=3;id=4;id=5'
 * defaultPathSerializer({ name: 'pt', value: { x: 1, y: 2 } }) // 'x,1,y,2'
 * ```
 */
export const defaultPathSerializer: PathSerializer = ({
  name,
  value,
  options,
}) => {
  if (value === undefined || value === null) return ''
  const style = options?.style ?? 'simple'
  const explode = options?.explode ?? false
  if (Array.isArray(value))
    return serializePathArray({ name, value, style, explode })
  if (isRecord(value))
    return serializePathObject({ name, value, style, explode })
  return serializePathPrimitive({ name, value, style })
}

function serializeHeaderValue(value: unknown, explode: boolean): string {
  if (Array.isArray(value))
    return value.filter(notNullish).map(toValue).join(',')
  if (!isRecord(value)) return toValue(value)
  const entries = Object.entries(value).filter(([, item]) => notNullish(item))
  if (explode)
    return entries.map(([key, item]) => `${key}=${toValue(item)}`).join(',')
  return entries
    .flatMap(([key, item]) => [key, item])
    .map(toValue)
    .join(',')
}

/** Header values must be Latin-1, so non-ASCII characters become JSON `\uXXXX` escapes. */
function toAsciiJson(value: unknown): string {
  return JSON.stringify(value, jsonReplacer).replace(
    /[\u007f-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}

/**
 * Serializes array and object header parameters with the OpenAPI `simple` style before they are
 * merged. Header values are not URL-encoded. Primitive values and headers without metadata pass
 * through untouched.
 */
export function applyHeaderStyles(
  headers: HeadersInit | undefined,
  styles: Record<string, HeaderParamStyle> | undefined,
): HeadersInit | undefined {
  if (!headers || !styles) return headers
  const entries = Array.isArray(headers) ? headers : Object.entries(headers)
  return entries.map(([key, value]) => {
    const style = styles[key]
    if (!style || value === undefined || value === null)
      return [key, value] as [string, HeaderValue]
    if (isJsonMediaType(style.contentType))
      return [key, toAsciiJson(value)] as [string, HeaderValue]
    if (typeof value !== 'object') return [key, value] as [string, HeaderValue]
    return [key, serializeHeaderValue(value, style.explode ?? false)] as [
      string,
      HeaderValue,
    ]
  })
}
