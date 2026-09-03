import { arrayBufferToBase64 } from '@tanstack/ai-utils'
import { CLOUDFLARE_API_BASE, gatewayHeaders, isBindingConfig } from './config'
import type { CloudflareConfig } from './config'

export type RunInputs = Record<string, unknown>

export interface RunBinary {
  /** Input field that carries the bytes on the binding path. */
  field: string
  body: Uint8Array | ArrayBuffer | Blob
  contentType: string
}

/**
 * Runs a Workers AI model with its native task inputs (embeddings, image,
 * speech, transcription) through the binding or the REST `/ai/run` endpoint.
 *
 * Returns the model's decoded output: an object for JSON tasks, or bytes
 * (`Uint8Array` / `ReadableStream`) for binary media outputs.
 */
export async function runModel(
  config: CloudflareConfig,
  model: string,
  inputs: RunInputs,
  options?: { signal?: AbortSignal; binary?: RunBinary },
): Promise<unknown> {
  if (isBindingConfig(config)) {
    const run = config.binding.run.bind(config.binding) as (
      model: string,
      inputs: RunInputs,
      options?: Record<string, unknown>,
    ) => Promise<unknown>
    // The binding serializes inputs as JSON; binary bodies must travel as a
    // ReadableStream, which it forwards as the raw request body.
    const bindingInputs = options?.binary
      ? {
          ...inputs,
          [options.binary.field]: {
            body: new Response(options.binary.body as BodyInit).body,
            contentType: options.binary.contentType,
          },
        }
      : inputs
    return await run(
      model,
      bindingInputs,
      config.gateway ? { gateway: config.gateway } : undefined,
    )
  }

  const url = new URL(
    `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/ai/run/${model}`,
  )
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    ...gatewayHeaders(config.gateway),
  }
  let body: BodyInit
  if (options?.binary) {
    // Binary tasks take the bytes as the body and the other inputs as query.
    for (const [key, value] of Object.entries(inputs)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    headers['Content-Type'] = options.binary.contentType
    body = options.binary.body as BodyInit
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(inputs)
  }
  const fetchImpl = config.fetch ?? fetch
  const response = await fetchImpl(url, {
    method: 'POST',
    headers,
    body,
    signal: options?.signal,
  })
  if (!response.ok) {
    throw new Error(
      `Workers AI request for ${model} failed (${response.status}): ${await response.text()}`,
    )
  }
  if (response.headers.get('content-type')?.includes('application/json')) {
    const json = (await response.json()) as {
      success?: boolean
      result?: unknown
      errors?: Array<{ message?: string }>
    }
    if (json.success === false) {
      throw new Error(
        `Workers AI request for ${model} failed: ${json.errors?.map((e) => e.message).join('; ')}`,
      )
    }
    return 'result' in json ? json.result : json
  }
  return new Uint8Array(await response.arrayBuffer())
}

/** Base64-encodes a binary model output, whatever shape it arrived in. */
export async function outputToBase64(output: unknown): Promise<string> {
  if (typeof output === 'string') return output
  let bytes: Uint8Array
  if (output instanceof Uint8Array) {
    bytes = output
  } else if (output instanceof ArrayBuffer) {
    bytes = new Uint8Array(output)
  } else if (output instanceof ReadableStream) {
    bytes = new Uint8Array(await new Response(output).arrayBuffer())
  } else {
    throw new Error(
      `Unexpected Workers AI output type: ${Object.prototype.toString.call(output)}`,
    )
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return arrayBufferToBase64(copy.buffer)
}
