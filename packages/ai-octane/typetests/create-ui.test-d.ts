import { describe, expectTypeOf, it } from 'vitest'
import type { ChatUIMessages } from '@tanstack/ai-client/ui'

import { createChatUI } from '../src/ui'
import { chatOptions } from '../../ai-client/tests/ui-fixtures'

// The `.tsrx.d.ts` companions are hand-maintained, so these guard against
// them drifting back to `ComponentBody<any>` or loose prop shapes.
describe('createChatUI() public types', () => {
  const UI = createChatUI(chatOptions, {
    components: { layout: () => null, message: () => null },
    partsComponents: {},
    toolsComponents: {
      getWeather: ({ part }) => {
        expectTypeOf(part.name).toEqualTypeOf<'getWeather'>()
        // @ts-expect-error getWeather input has `city`, not `town`
        void part.input?.town
      },
      purchaseItem: () => null,
    },
    interruptsComponents: { generic: { choosePlan: () => null } },
  })

  type MessagesChildren = NonNullable<
    NonNullable<Parameters<typeof UI.Messages>[0]>['children']
  >

  it('types UI.Messages children with the chat messages', () => {
    expectTypeOf<Parameters<MessagesChildren>[0]>().toEqualTypeOf<
      ChatUIMessages<typeof chatOptions>
    >()
    const children: MessagesChildren = (messages) => {
      // @ts-expect-error a message has no `nope` property
      void messages[0]?.nope
      return null
    }
    void children
  })

  it('requires interruptsComponents when the options declare interrupts', () => {
    // @ts-expect-error chatOptions declares `choosePlan`
    createChatUI(chatOptions, {
      components: { layout: () => null, message: () => null },
      partsComponents: {},
      toolsComponents: { getWeather: () => null, purchaseItem: () => null },
    })
  })
})
