import { expectTypeOf } from 'vitest'
import type {
  ChatUIData,
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
