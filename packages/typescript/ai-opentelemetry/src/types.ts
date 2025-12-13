import type { Tracer } from '@opentelemetry/api'

/**
 * Configuration options for the TanStack AI OpenTelemetry instrumentation
 */
export interface TanStackAIInstrumentationConfig {
  /**
   * OpenTelemetry tracer instance to use for creating spans
   * If not provided, will use the global tracer provider
   */
  tracer?: Tracer

  /**
   * Name for the tracer (used when tracer is not provided)
   * @default '@tanstack/ai'
   */
  tracerName?: string

  /**
   * Version for the tracer (used when tracer is not provided)
   * @default package version
   */
  tracerVersion?: string

  /**
   * Whether to record prompt/response content in span attributes
   * Disable this in production if content may contain sensitive data
   * @default false
   */
  recordContent?: boolean

  /**
   * Whether to record tool call arguments and results
   * @default true
   */
  recordToolCalls?: boolean

  /**
   * Custom attribute prefix for all span attributes
   * @default 'gen_ai'
   */
  attributePrefix?: string
}

/**
 * GenAI Semantic Conventions for OpenTelemetry
 * Based on https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */
export const GenAIAttributes = {
  // System attributes
  SYSTEM: 'gen_ai.system',
  REQUEST_MODEL: 'gen_ai.request.model',
  RESPONSE_MODEL: 'gen_ai.response.model',

  // Request attributes
  REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  REQUEST_TOP_P: 'gen_ai.request.top_p',
  REQUEST_STOP_SEQUENCES: 'gen_ai.request.stop_sequences',

  // Response attributes
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',

  // Usage attributes
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',

  // Tool attributes
  TOOL_NAME: 'gen_ai.tool.name',
  TOOL_CALL_ID: 'gen_ai.tool.call_id',

  // TanStack AI specific attributes
  TANSTACK_REQUEST_ID: 'tanstack_ai.request_id',
  TANSTACK_STREAM_ID: 'tanstack_ai.stream_id',
  TANSTACK_CLIENT_ID: 'tanstack_ai.client_id',
  TANSTACK_ITERATION: 'tanstack_ai.iteration',
  TANSTACK_MESSAGE_COUNT: 'tanstack_ai.message_count',
  TANSTACK_TOOL_COUNT: 'tanstack_ai.tool_count',
  TANSTACK_HAS_TOOLS: 'tanstack_ai.has_tools',
  TANSTACK_STREAMING: 'tanstack_ai.streaming',
} as const
