export type MissingResponseStreamFeature =
  | 'TextDecoder'
  | 'Response.body'
  | 'Response.body.getReader'

export class UnsupportedResponseStreamError extends Error {
  readonly missingFeature: MissingResponseStreamFeature

  constructor(missingFeature: MissingResponseStreamFeature) {
    super(createUnsupportedResponseStreamMessage(missingFeature))
    this.name = 'UnsupportedResponseStreamError'
    this.missingFeature = missingFeature
  }
}

function createUnsupportedResponseStreamMessage(
  missingFeature: MissingResponseStreamFeature,
): string {
  return `Streaming fetch responses are not supported in this runtime because ${missingFeature} is unavailable. React Native users need a compatible fetch/stream/TextDecoder polyfill, or should use a fetch, XHR, or custom transport that can deliver streaming chunks.`
}

export function getResponseStreamReader(
  response: Response,
): ReadableStreamDefaultReader<Uint8Array> {
  if (!response.body) {
    throw new UnsupportedResponseStreamError('Response.body')
  }

  if (typeof response.body.getReader !== 'function') {
    throw new UnsupportedResponseStreamError('Response.body.getReader')
  }

  return response.body.getReader()
}

export function createResponseStreamTextDecoder(): TextDecoder {
  if (typeof globalThis.TextDecoder !== 'function') {
    throw new UnsupportedResponseStreamError('TextDecoder')
  }

  return new globalThis.TextDecoder()
}
