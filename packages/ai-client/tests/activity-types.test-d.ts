import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { defineActivityType } from '@tanstack/ai/client'
import type {
  AnyActivityTypeDefinition,
  UIMessage as CoreUIMessage,
  SandboxStatusContent,
} from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import { createChatClientOptions } from '../src/types'
import type { InferChatMessages, UIMessage } from '../src/types'
import { selectChatUI, selectMessageUI } from '../src/ui'
import type {
  ChatUIActivitiesOf,
  ChatUIActivityPartOf,
  ChatUIActivityType,
  ChatUIMessages,
} from '../src/ui'

const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: z.object({ step: z.number(), total: z.number() }),
})

// No options below declare this type.
const buildLog = defineActivityType({
  activityType: 'build.log',
  contentSchema: z.object({ line: z.string() }),
})

const connection = {
  async *connect() {},
}

type ActivityPartIn<TMessage extends { parts: ReadonlyArray<unknown> }> =
  Extract<TMessage['parts'][number], { type: 'activity' }>

// With no `activities`, client messages type the built-in activity types.
const defaultClient = new ChatClient({ threadId: 'thread-1', connection })
declare const defaultPart: ActivityPartIn<
  ReturnType<typeof defaultClient.getMessages>[number]
>
if (defaultPart.activityType === 'sandbox.status') {
  expectTypeOf(defaultPart.content.status).toEqualTypeOf<
    'starting' | 'ready' | 'failed'
  >()
}

// `activities: []` also types the built-in activity types.
const builtInClient = new ChatClient({
  threadId: 'thread-1',
  connection,
  activities: [],
})
declare const builtInPart: ActivityPartIn<
  ReturnType<typeof builtInClient.getMessages>[number]
>
if (builtInPart.activityType === 'sandbox.status') {
  expectTypeOf(builtInPart.content.status).toEqualTypeOf<
    'starting' | 'ready' | 'failed'
  >()
}
// @ts-expect-error no activity type is named 'sandbox.statuz'
if (builtInPart.activityType === 'sandbox.statuz') void builtInPart

// The options type the messages, also through `InferChatMessages`.
const options = createChatClientOptions({
  threadId: 'thread-1',
  connection,
  activities: [deployProgress],
})
declare const declaredPart: ActivityPartIn<
  InferChatMessages<typeof options>[number]
>
if (declaredPart.activityType === 'deploy.progress') {
  expectTypeOf(declaredPart.content).toEqualTypeOf<{
    step: number
    total: number
  }>()
}
// A type that the options do not declare is read with `is()`.
if (buildLog.is(declaredPart)) {
  expectTypeOf(declaredPart.content.line).toEqualTypeOf<string>()
}
// @ts-expect-error 'build.log' is not declared, so `===` cannot select it
if (declaredPart.activityType === 'build.log') void declaredPart

// Inputs take plain messages, also from `@tanstack/ai`, on a typed client.
declare const coreMessages: Array<CoreUIMessage>
declare const coreMessage: CoreUIMessage
const typedClient = new ChatClient({
  threadId: 'thread-1',
  connection,
  activities: [deployProgress],
  initialMessages: coreMessages,
})
typedClient.setMessagesManually(coreMessages)
void typedClient.append(coreMessage)

// Outputs are typed, and a typed message is still a plain `UIMessage`.
declare const typedPart: ActivityPartIn<
  ReturnType<typeof typedClient.getMessages>[number]
>
if (typedPart.activityType === 'deploy.progress') {
  expectTypeOf(typedPart.content.total).toEqualTypeOf<number>()
}
const plainMessages: Array<UIMessage> = typedClient.getMessages()
typedClient.setMessagesManually(typedClient.getSnapshot().messages)
void plainMessages

// Generic code, like a framework binding, can pass typed messages on as plain
// messages.
function toPlainMessages<
  TActivities extends ReadonlyArray<AnyActivityTypeDefinition> | undefined,
>(
  messages: ReadonlyArray<UIMessage<any, unknown, undefined, TActivities>>,
): ReadonlyArray<UIMessage> {
  return messages
}
void toPlainMessages

// UI types: the built-in names plus the declared names.
const uiOptions = { connection, activities: [deployProgress] }
expectTypeOf<ChatUIActivityType<typeof uiOptions>>().toEqualTypeOf<
  'sandbox.status' | 'sandbox.approval' | 'deploy.progress'
>()
// Options with no `activities` still give the built-in names.
const noActivityOptions = createChatClientOptions({
  threadId: 'thread-1',
  connection,
})
expectTypeOf<ChatUIActivitiesOf<typeof noActivityOptions>>().toEqualTypeOf<
  readonly []
>()
// An explicit `undefined` also gives the built-in types.
expectTypeOf<ChatUIActivitiesOf<{ activities?: undefined }>>().toEqualTypeOf<
  readonly []
>()
expectTypeOf<ChatUIActivityType<typeof noActivityOptions>>().toEqualTypeOf<
  'sandbox.status' | 'sandbox.approval'
>()
expectTypeOf<
  ChatUIActivityPartOf<typeof noActivityOptions, 'sandbox.status'>['content']
>().toEqualTypeOf<SandboxStatusContent>()

expectTypeOf<
  ChatUIActivityPartOf<typeof uiOptions, 'deploy.progress'>['content']
>().toEqualTypeOf<{ step: number; total: number }>()
expectTypeOf<
  ChatUIActivityPartOf<
    typeof uiOptions,
    'sandbox.approval'
  >['content']['status']
>().toEqualTypeOf<'pending' | 'granted' | 'denied'>()

// The UI messages type their activity parts, also with no `activities`.
declare const uiPart: ActivityPartIn<
  ChatUIMessages<typeof noActivityOptions>[number]
>
if (uiPart.activityType === 'sandbox.status') {
  expectTypeOf(uiPart.content.status).toEqualTypeOf<
    'starting' | 'ready' | 'failed'
  >()
}
declare const declaredUIPart: ActivityPartIn<
  ChatUIMessages<typeof uiOptions>[number]
>
if (declaredUIPart.activityType === 'deploy.progress') {
  expectTypeOf(declaredUIPart.content).toEqualTypeOf<{
    step: number
    total: number
  }>()
}

// A map keyed by activity type gives each entry its own typed part, as the UI
// factories do with `activitiesComponents`.
type ActivityRenderers<TOptions> = {
  [K in ChatUIActivityType<TOptions>]?: (
    part: ChatUIActivityPartOf<TOptions, K>,
  ) => void
}
const renderers: ActivityRenderers<typeof uiOptions> = {
  'deploy.progress': (part) => {
    expectTypeOf(part.content.step).toEqualTypeOf<number>()
  },
  'sandbox.status': (part) => {
    expectTypeOf(part.content.status).toEqualTypeOf<
      'starting' | 'ready' | 'failed'
    >()
  },
  // @ts-expect-error 'build.log' is not declared in the options
  'build.log': () => {},
}
void renderers

// The selectors take typed messages with no cast, also in generic code like
// the UI factories. The selection keeps the activity types of the messages.
function selectInGenericCode<TOptions>(messages: ChatUIMessages<TOptions>) {
  const first = messages[0]
  if (first) selectMessageUI(first, {})
  return selectChatUI({ messages })
}
void selectInGenericCode

declare const uiMessages: ChatUIMessages<typeof uiOptions>
const selection = selectChatUI({ messages: uiMessages })
declare const selectedPart: ActivityPartIn<
  (typeof selection.messages)[number]['message']
>
if (selectedPart.activityType === 'deploy.progress') {
  expectTypeOf(selectedPart.content.step).toEqualTypeOf<number>()
}
