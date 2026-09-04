import { expectTypeOf } from 'vitest'
import type {
  ChatUIData,
  ChatUIInterrupt,
  ChatUIInterruptOf,
  ChatUISelectedPartOf,
  ChatUIToolPart,
  RegisteredUIInterrupt,
} from '../src/ui'
import { chatOptions } from './ui-fixtures'

type WeatherPart = ChatUIToolPart<typeof chatOptions, 'getWeather'>
type PlanInterrupt = RegisteredUIInterrupt<typeof chatOptions, 'choosePlan'>

expectTypeOf<WeatherPart['input']>().toEqualTypeOf<
  { city: string } | undefined
>()
expectTypeOf<WeatherPart['output']>().toEqualTypeOf<
  { temperature: number } | undefined
>()
expectTypeOf<PlanInterrupt['payload']>().toEqualTypeOf<
  { title: string } | undefined
>()
expectTypeOf<ChatUIData<typeof chatOptions>>().toEqualTypeOf<{
  answer: string
}>()

type ChoosePlan = ChatUIInterruptOf<typeof chatOptions, 'choosePlan'>
expectTypeOf<ChoosePlan['payload']>().toEqualTypeOf<
  { title: string } | undefined
>()

type PurchaseApproval = ChatUIInterruptOf<typeof chatOptions, 'purchaseItem'>
expectTypeOf<PurchaseApproval['kind']>().toEqualTypeOf<'tool-approval'>()
expectTypeOf<PurchaseApproval['toolName']>().toEqualTypeOf<'purchaseItem'>()

type AnyInterrupt = ChatUIInterruptOf<typeof chatOptions>
expectTypeOf<AnyInterrupt>().toEqualTypeOf<ChatUIInterrupt>()

type TextSelected = ChatUISelectedPartOf<typeof chatOptions, 'text'>
expectTypeOf<TextSelected['part']['type']>().toEqualTypeOf<'text'>()
expectTypeOf<TextSelected['part']['content']>().toEqualTypeOf<string>()

type ActivitySelected = ChatUISelectedPartOf<typeof chatOptions, 'activity'>
expectTypeOf<ActivitySelected['part']['type']>().toEqualTypeOf<'activity'>()
expectTypeOf<ActivitySelected['part']['activityType']>().toEqualTypeOf<string>()
