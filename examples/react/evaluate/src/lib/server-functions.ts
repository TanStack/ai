import { createServerFn } from '@tanstack/react-start'
import { boolean, choice, decide, score } from '@tanstack/ai'
import { ollayaDecider } from '@tanstack/ai-ollaya'
import { typesafeDecider } from '@tanstack/ai-typesafe'
import { openRouterDecider } from '@tanstack/ai-openrouter'
import { vercelGatewayDecider } from '@tanstack/ai-vercel-gateway'
import { cloudflareDecider } from '@tanstack/ai-cloudflare'
import { isProvider } from './models'
import type { EvaluateResult } from '@tanstack/ai'
import type { Provider } from './models'

interface EvaluateInput {
  ticket: string
  provider: Provider
}

const TICKET_QUESTIONS = {
  queue: choice({
    instructions: 'Which team should handle this ticket?',
    options: {
      billing: 'Payments, invoices, refunds',
      tech: 'Bugs, outages, integrations',
      sales: 'Pricing, upgrades, new accounts',
    },
  }),
  urgency: score({
    instructions: 'How urgent is this ticket?',
    levels: ['low', 'medium', 'high'],
  }),
  refund: boolean({
    instructions: 'Is the customer asking for a refund?',
  }),
}

export type TicketEvaluateResult = EvaluateResult<typeof TICKET_QUESTIONS>

/**
 * Asks three typed questions about a support ticket.
 *
 * The API key never leaves the server. Hosted adapters read their key from
 * the environment inside this handler. Ollaya uses the local server. Set
 * `OLLAYA_BASE_URL` to point that adapter at another host.
 *
 * The branches call the same `decide()` with a different adapter. They
 * are written out separately rather than sharing an `adapter` variable so
 * each call site keeps the adapter's literal model type.
 */
export const evaluateTicketFn = createServerFn({ method: 'POST' })
  .inputValidator((data: EvaluateInput) => {
    if (!data.ticket.trim()) throw new Error('Ticket text is required')
    if (!isProvider(data.provider)) {
      throw new Error(`Unknown provider: ${data.provider}`)
    }
    return data
  })
  .handler(async ({ data }) => {
    const ticket = data.ticket
    const questions = TICKET_QUESTIONS

    switch (data.provider) {
      case 'ollaya':
        // Local Ollaya server — no key. Set OLLAYA_BASE_URL to point elsewhere.
        return await decide({
          adapter: ollayaDecider('laya:latest', {
            baseURL: process.env.OLLAYA_BASE_URL?.trim() || undefined,
          }),
          state: ticket,
          questions,
        })
      case 'typesafe':
        return await decide({
          adapter: typesafeDecider('jev-latest'),
          state: ticket,
          questions,
        })
      case 'openrouter':
        return await decide({
          adapter: openRouterDecider('~typesafe/jev-latest'),
          state: ticket,
          questions,
        })
      case 'vercel':
        return await decide({
          adapter: vercelGatewayDecider('typesafe-ai/jev'),
          state: ticket,
          questions,
        })
      case 'cloudflare':
        const res = await decide({
          adapter: cloudflareDecider('typesafe/jev'),
          state: ticket,
          questions,
        })

        return res
      default: {
        const exhaustive: never = data.provider
        throw new Error(`Unknown provider: ${exhaustive}`)
      }
    }
  })
