import { describe, expect, it } from 'vitest'
import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '@aws-crypto/sha256-js'
import { signSigV4 } from '../src/utils/sigv4'
import type { AwsCredentialIdentity, HttpRequest } from '@smithy/types'

// Oracle: the same request signed by @smithy/signature-v4 and by signSigV4
// must give the same SigV4 headers.

const DATE = new Date('2026-11-02T12:34:56.789Z')
const STATIC_CREDENTIALS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
}
const SESSION_CREDENTIALS = {
  ...STATIC_CREDENTIALS,
  sessionToken: 'IQoJb3JpZ2luX2VjEXAMPLE/token+with=chars',
}
const SIGNED_HEADER_NAMES = [
  'host',
  'x-amz-date',
  'x-amz-security-token',
  'x-amz-content-sha256',
  'authorization',
]

interface SignCase {
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body?: BodyInit
  credentials: AwsCredentialIdentity
  service: string
  region: string
  // What the AWS SDK puts on its HttpRequest: the wire path and the decoded query.
  path: string
  query: Record<string, string | Array<string>>
}

function streamBody() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('chunk'))
      controller.close()
    },
  })
}

const cases: Array<SignCase> = [
  {
    name: 'POST JSON body',
    method: 'POST',
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'OpenAI/JS 6.0.0',
    },
    body: '{"model":"openai.gpt-oss-120b-1:0","messages":[{"role":"user","content":"héllo"}]}',
    credentials: STATIC_CREDENTIALS,
    service: 'bedrock',
    region: 'us-east-1',
    path: '/openai/v1/chat/completions',
    query: {},
  },
  {
    name: 'POST JSON body with a session token',
    method: 'POST',
    url: 'https://bedrock-mantle.us-west-2.api.aws/v1/responses',
    headers: {
      'content-type': 'application/json',
      'x-custom': '  spaced    out   value ',
      'sec-fetch-mode': 'cors',
    },
    body: '{"model":"openai.gpt-oss-120b","input":"hi"}',
    credentials: SESSION_CREDENTIALS,
    service: 'bedrock-mantle',
    region: 'us-west-2',
    path: '/v1/responses',
    query: {},
  },
  {
    name: 'GET with query params that need encoding',
    method: 'GET',
    url: 'https://bedrock-mantle.us-west-2.api.aws/v1/responses/resp_1?include=c*d&limit=&after=x%2Fy&include=a%20b&z~=1',
    headers: { accept: 'application/json' },
    credentials: SESSION_CREDENTIALS,
    service: 'bedrock-mantle',
    region: 'us-west-2',
    path: '/v1/responses/resp_1',
    query: { include: ['c*d', 'a b'], limit: '', after: 'x/y', 'z~': '1' },
  },
  {
    name: 'path with spaces, special characters, and empty segments',
    method: 'POST',
    url: "https://bedrock-runtime.eu-central-1.amazonaws.com/model/us.anthropic.claude%3Av1/a b/(x)!'//",
    headers: { 'content-type': 'application/json' },
    body: '{}',
    credentials: STATIC_CREDENTIALS,
    service: 'bedrock',
    region: 'eu-central-1',
    path: "/model/us.anthropic.claude%3Av1/a%20b/(x)!'//",
    query: {},
  },
  {
    name: 'binary body',
    method: 'POST',
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/files',
    headers: { 'content-type': 'application/octet-stream' },
    body: new Uint8Array([0, 1, 2, 250, 255]),
    credentials: STATIC_CREDENTIALS,
    service: 'bedrock',
    region: 'us-east-1',
    path: '/openai/v1/files',
    query: {},
  },
  {
    name: 'streaming body (unsigned payload)',
    method: 'POST',
    url: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/files',
    headers: { 'content-type': 'multipart/form-data; boundary=x' },
    body: streamBody(),
    credentials: SESSION_CREDENTIALS,
    service: 'bedrock',
    region: 'us-east-1',
    path: '/openai/v1/files',
    query: {},
  },
]

async function signWithSmithy(signCase: SignCase) {
  const url = new URL(signCase.url)
  const signer = new SignatureV4({
    service: signCase.service,
    region: signCase.region,
    credentials: signCase.credentials,
    sha256: Sha256,
  })
  const request: HttpRequest = {
    method: signCase.method,
    protocol: url.protocol,
    hostname: url.hostname,
    path: signCase.path,
    query: signCase.query,
    headers: { ...signCase.headers, host: url.host },
    body: signCase.body,
  }
  const signed = await signer.sign(request, { signingDate: DATE })
  return new Headers(signed.headers)
}

function pickSigned(headers: Headers) {
  return Object.fromEntries(
    SIGNED_HEADER_NAMES.map((name) => [name, headers.get(name)]),
  )
}

describe('signSigV4', () => {
  it.each(cases)('matches @smithy/signature-v4: $name', async (signCase) => {
    const expected = await signWithSmithy(signCase)
    const actual = await signSigV4(
      {
        method: signCase.method,
        url: signCase.url,
        headers: signCase.headers,
        body: signCase.body,
      },
      signCase.credentials,
      { service: signCase.service, region: signCase.region, date: DATE },
    )

    expect(pickSigned(actual)).toEqual(pickSigned(expected))
    expect(actual.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /)
  })

  it('keeps the caller headers and drops a stale authorization header', async () => {
    const headers = await signSigV4(
      {
        method: 'GET',
        url: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/models',
        headers: { authorization: 'Bearer old', 'x-trace': 'abc' },
      },
      STATIC_CREDENTIALS,
      { service: 'bedrock', region: 'us-east-1', date: DATE },
    )

    expect(headers.get('x-trace')).toBe('abc')
    expect(headers.get('x-amz-date')).toBe('20261102T123456Z')
    expect(headers.get('x-amz-security-token')).toBeNull()
    expect(headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261102\/us-east-1\/bedrock\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-trace, Signature=[0-9a-f]{64}$/,
    )
  })
})
