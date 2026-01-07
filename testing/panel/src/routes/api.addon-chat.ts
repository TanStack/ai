import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import {
  getAvailableAddOnsToolDef,
  selectAddOnsToolDef,
  unselectAddOnsToolDef,
} from '@/lib/addon-tools'

const SYSTEM_PROMPT = `You are an AI assistant that helps users configure their project by selecting add-ons.

IMPORTANT WORKFLOW:
1. When the user asks about available add-ons or wants to configure their project, FIRST call getAvailableAddOns to see what's available and their current selection state.
2. Use selectAddOns to enable add-ons the user wants.
3. Use unselectAddOns to disable add-ons the user doesn't want.

CRITICAL RULES:
- ALWAYS call getAvailableAddOns FIRST to see current state before making any selections.
- When selecting/unselecting add-ons, you MUST call the appropriate tool - do NOT just describe what you would do.
- You can select or unselect MULTIPLE add-ons in a single tool call by passing an array of IDs.
- After making changes, briefly confirm what was changed.

Available add-on categories:
- authentication: User auth solutions (clerk)
- payments: Payment processing (stripe)
- database: Database ORMs (drizzle, prisma)
- styling: CSS frameworks (tailwind)
- ui-components: Component libraries (shadcn)
- monitoring: Error tracking (sentry)
- analytics: Product analytics (posthog)

Example interactions:
- "Add authentication" → Call getAvailableAddOns, then selectAddOns(["clerk"])
- "I want payments and analytics" → Call getAvailableAddOns, then selectAddOns(["stripe", "posthog"])
- "Remove the database ORM" → Call getAvailableAddOns to check which is selected, then unselectAddOns with the appropriate ID
`

export const Route = createFileRoute('/api/addon-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Capture request signal before reading body
        const requestSignal = request.signal

        // If request is already aborted, return early
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        const body = await request.json()
        const messages = body.messages

        try {
          const stream = chat({
            adapter: openaiText('gpt-4o'),
            tools: [
              // Just the definitions - client will handle execution
              getAvailableAddOnsToolDef,
              selectAddOnsToolDef,
              unselectAddOnsToolDef,
            ],
            systemPrompts: [SYSTEM_PROMPT],
            agentLoopStrategy: maxIterations(10),
            messages,
            abortController,
          })

          return toServerSentEventsResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[API Route] Error in addon-chat request:', error)

          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
