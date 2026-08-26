import { expectTypeOf } from 'vitest'
import { createUI } from '../src/create-ui'
import { chatOptions } from '../../ai-client/tests/ui-fixtures'

const UI = createUI(chatOptions)

UI.defineComponents({
  layout: ({ chat, renderMessages }) => {
    expectTypeOf(chat.messages).toMatchTypeOf<ReadonlyArray<unknown>>()
    return renderMessages()
  },
  message: ({ renderParts }) => renderParts(),
  parts: {
    fallback: () => null,
  },
  tools: {
    getWeather: ({ part, result }) => {
      expectTypeOf(part.input).toEqualTypeOf<{ city: string } | undefined>()
      expectTypeOf(part.output).toEqualTypeOf<
        { temperature: number } | undefined
      >()
      expectTypeOf(result?.toolCallId).toEqualTypeOf<string | undefined>()
      return null
    },
    // @ts-expect-error This tool is not in chatOptions.
    unknownTool: () => null,
  },
  interrupts: {
    registered: {
      choosePlan: ({ interrupt }) => {
        interrupt.resolveInterrupt('approved')
        // @ts-expect-error The response schema accepts a string.
        interrupt.resolveInterrupt(42)
        return null
      },
    },
    fallback: () => null,
  },
})
