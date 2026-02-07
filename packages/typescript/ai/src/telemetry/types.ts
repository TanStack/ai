import type { Attributes, Tracer } from '@opentelemetry/api'

/**
 * Telemetry data for tracking and debugging.
 */
export type TelemetrySettings = {
  /**
   * Identifier for the specific function or operation being tracked.
   */
  functionId?: string

  /**
   * Arbitrary key-value pairs for tracking context.
   * Common keys: userId, sessionId, billingAccount, environment, etc.
   */
  metadata?: Record<string, Attributes>

  /**
   * A custom tracer to use for tracing.
   */
  tracer?: Tracer
}

/**
 * Telemetry data for tracking and debugging.
 * This type is used for events that are emitted by the aiEventClient.
 */
export type TelemetryEvent = {
  /**
   * Identifier for the specific function or operation being tracked.
   */
  functionId?: string

  /**
   * Arbitrary key-value pairs for tracking context.
   * Common keys: userId, sessionId, billingAccount, environment, etc.
   */
  metadata?: Record<string, Attributes>
}

/**
 * Converts TelemetrySettings to TelemetryEvent by stripping the tracer.
 */
export function toTelemetryEvent(
  telemetry?: TelemetrySettings,
): TelemetryEvent | undefined {
  if (!telemetry) {
    return undefined
  }

  return {
    functionId: telemetry.functionId,
    metadata: telemetry.metadata,
  }
}
