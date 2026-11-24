import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { defineActivityType } from '../src'
import type { TextPart, TypedActivityPart } from '../src/client'

const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: z.object({ step: z.number(), total: z.number() }),
})

declare const part: TypedActivityPart

// `===` on a built-in name narrows `content`. The final `else` of a chain
// that covers both built-ins keeps the other types.
if (part.activityType === 'sandbox.status') {
  expectTypeOf(part.content.status).toEqualTypeOf<
    'starting' | 'ready' | 'failed'
  >()
} else if (part.activityType === 'sandbox.approval') {
  expectTypeOf(part.content.approvalId).toEqualTypeOf<string>()
} else {
  expectTypeOf(part.content).toEqualTypeOf<Record<string, any>>()
}

// A typo in a built-in name is a compile error.
// @ts-expect-error no activity type is named 'sandbox.statuz'
if (part.activityType === 'sandbox.statuz') void part

// A `switch` with a `default` branch compiles. After both built-ins,
// `default` keeps the other types.
switch (part.activityType) {
  case 'sandbox.status':
    break
  case 'sandbox.approval':
    expectTypeOf(part.content.status).toEqualTypeOf<
      'pending' | 'granted' | 'denied'
    >()
    break
  default:
    expectTypeOf(part.content).toEqualTypeOf<Record<string, any>>()
}

// `is()` narrows a type that the union does not declare, also when the union
// has text parts. `activityType` then has the fallback type, not the real name.
declare const messagePart: TextPart | TypedActivityPart
if (deployProgress.is(messagePart)) {
  expectTypeOf(messagePart.content.step).toEqualTypeOf<number>()
  expectTypeOf(messagePart.content.total).toEqualTypeOf<number>()
  expectTypeOf(messagePart.type).toEqualTypeOf<'activity'>()
  expectTypeOf(
    messagePart.activityType,
  ).toEqualTypeOf<`tanstack:other-activity:${string}`>()
}

// A declared definition narrows with `===`, and its `is()` still narrows.
declare const declaredPart: TypedActivityPart<[typeof deployProgress]>
if (declaredPart.activityType === 'deploy.progress') {
  expectTypeOf(declaredPart.content).toEqualTypeOf<{
    step: number
    total: number
  }>()
}
if (deployProgress.is(declaredPart)) {
  expectTypeOf(declaredPart.content.step).toEqualTypeOf<number>()
}

// A stored record has no `type`, so `is()` does not claim one.
declare const record: { id: string; activityType: string; content: unknown }
if (deployProgress.is(record)) {
  expectTypeOf(record.content.step).toEqualTypeOf<number>()
  expectTypeOf(record.type).toEqualTypeOf<'activity' | undefined>()
}
