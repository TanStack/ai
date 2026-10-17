import { expectTypeOf, it } from 'vitest'
import type {
  HarnessSpan,
  HarnessSpanContext,
  HarnessTracer,
  ObservabilityOptions,
} from '../src'

// A copy of the OpenTelemetry API shapes (`@opentelemetry/api` 1.x) that the
// harness types must fit. The test does not import the real package.
declare enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}
declare enum SpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4,
}
type AttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>
interface Attributes {
  [attributeKey: string]: AttributeValue | undefined
}
type TimeInput = [number, number] | number | Date
interface TraceState {
  set(key: string, value: string): TraceState
  unset(key: string): TraceState
  get(key: string): string | undefined
  serialize(): string
}
interface SpanContext {
  traceId: string
  spanId: string
  isRemote?: boolean
  traceFlags: number
  traceState?: TraceState
}
interface Link {
  context: SpanContext
  attributes?: Attributes
  droppedAttributesCount?: number
}
type Exception =
  | { code: string | number; name?: string; message?: string; stack?: string }
  | { code?: string | number; message: string; name?: string; stack?: string }
  | { code?: string | number; message?: string; name: string; stack?: string }
  | string
interface Span {
  spanContext(): SpanContext
  setAttribute(key: string, value: AttributeValue): this
  setAttributes(attributes: Attributes): this
  addEvent(
    name: string,
    attributesOrStartTime?: Attributes | TimeInput,
    startTime?: TimeInput,
  ): this
  addLink(link: Link): this
  addLinks(links: Array<Link>): this
  setStatus(status: { code: SpanStatusCode; message?: string }): this
  updateName(name: string): this
  end(endTime?: TimeInput): void
  isRecording(): boolean
  recordException(exception: Exception, time?: TimeInput): void
}
interface Context {
  getValue(key: symbol): unknown
  setValue(key: symbol, value: unknown): Context
  deleteValue(key: symbol): Context
}
interface SpanOptions {
  kind?: SpanKind
  attributes?: Attributes
  links?: Array<Link>
  startTime?: TimeInput
  root?: boolean
}
interface Tracer {
  startSpan(name: string, options?: SpanOptions, context?: Context): Span
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    fn: F,
  ): ReturnType<F>
  startActiveSpan<F extends (span: Span) => unknown>(
    name: string,
    options: SpanOptions,
    fn: F,
  ): ReturnType<F>
}

declare const otelTracer: Tracer

it('takes an OpenTelemetry tracer with no cast', () => {
  const tracer: HarnessTracer = otelTracer
  const options: ObservabilityOptions = { tracer: otelTracer }
  expectTypeOf(tracer).toEqualTypeOf<HarnessTracer>()
  expectTypeOf(options.tracer).toEqualTypeOf<HarnessTracer | undefined>()
  expectTypeOf<Span>().toExtend<HarnessSpan>()
  expectTypeOf<SpanContext>().toExtend<HarnessSpanContext>()
  // The links that the harness passes to `startSpan` are OpenTelemetry links.
  expectTypeOf<{ context: HarnessSpanContext }>().toExtend<Link>()
})
