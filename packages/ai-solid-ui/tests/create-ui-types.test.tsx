import { expectTypeOf } from 'vitest'
import { createUI } from '../src/create-ui'
import { chatOptions } from '../../ai-client/tests/ui-fixtures'

const UI = createUI(chatOptions)

UI.defineComponents({
  layout: (props) => {
    expectTypeOf(props.chat.messages).toMatchTypeOf<unknown>()
    return props.renderMessages()
  },
  message: (props) => props.renderParts(),
  parts: {
    fallback: () => null,
  },
  tools: {
    getWeather: (props) => {
      expectTypeOf(props.part.input).toEqualTypeOf<
        { city: string } | undefined
      >()
      expectTypeOf(props.part.output).toEqualTypeOf<
        { temperature: number } | undefined
      >()
      return null
    },
    // @ts-expect-error This tool is not in chatOptions.
    unknownTool: () => null,
  },
  interrupts: {
    generic: {
      choosePlan: (props) => {
        props.interrupt.resolveInterrupt('approved')
        // @ts-expect-error The response schema accepts a string.
        props.interrupt.resolveInterrupt(42)
        return null
      },
      fallback: () => null,
    },
  },
})
