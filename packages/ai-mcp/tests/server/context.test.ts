import { describe, expect, it } from 'vitest'
import {
  createServerToolContext,
  ToolInputRequiredError,
} from '../../src/server/context'
import type { SampleRequest, ToolInputRequest } from '../../src/server/context'

const cityRequest: ToolInputRequest = { message: 'Which city?' }
const summaryRequest: SampleRequest = {
  messages: [{ role: 'user', content: 'Draft a summary' }],
}

function textCallback(text: string) {
  const requests: Array<SampleRequest> = []
  return {
    requests,
    fn: async (request: SampleRequest) => {
      requests.push(request)
      return text
    },
  }
}

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('The call resolved')
}

describe('createServerToolContext', () => {
  describe('requestInput', () => {
    it('waits on the supplied function and returns that answer in the same call', async () => {
      let runs = 0
      let resolveInput: ((answer: string) => void) | undefined
      const seen: Array<ToolInputRequest> = []
      const ctx = createServerToolContext({
        era: '2025',
        waitForInput: (request) => {
          seen.push(request)
          return new Promise((resolve) => {
            resolveInput = resolve
          })
        },
        clientSample: async () => 'from-client',
      })

      const pending = (async () => {
        runs += 1
        return ctx.requestInput(cityRequest)
      })()

      expect(runs).toBe(1)
      expect(seen).toEqual([cityRequest])
      if (resolveInput === undefined) {
        throw new Error('requestInput did not wait on the supplied function')
      }
      resolveInput('Paris')

      await expect(pending).resolves.toBe('Paris')
      expect(runs).toBe(1)
    })

    it('ends the first 2026 call as input required and returns the answer on retry', async () => {
      let runs = 0
      let finished = 0
      const tool = async (ctx: {
        requestInput: (request: ToolInputRequest) => Promise<unknown>
      }) => {
        runs += 1
        const answer = await ctx.requestInput(cityRequest)
        finished += 1
        return answer
      }

      const first = createServerToolContext({ era: '2026' })
      const error = await rejectionOf(tool(first))

      expect(error).toBeInstanceOf(ToolInputRequiredError)
      if (!(error instanceof ToolInputRequiredError)) {
        throw new Error('expected ToolInputRequiredError')
      }
      expect(error.resultType).toBe('input_required')
      expect(error.request).toBe(cityRequest)
      expect(runs).toBe(1)
      expect(finished).toBe(0)

      const second = createServerToolContext({
        era: '2026',
        inputAnswer: 'Paris',
      })

      await expect(tool(second)).resolves.toBe('Paris')
      expect(runs).toBe(2)
      expect(finished).toBe(1)
    })

    it('throws on a second 2026 question in one call instead of reusing the answer', async () => {
      const ctx = createServerToolContext({ era: '2026', inputAnswer: 'Paris' })

      await expect(ctx.requestInput(cityRequest)).resolves.toBe('Paris')
      await expect(ctx.requestInput({ message: 'Which day?' })).rejects.toThrow(
        'only one question per tool call',
      )
    })
  })

  describe('sample', () => {
    it('calls the client sample function and does not call the local adapter', async () => {
      const client = textCallback('from-client')
      const adapter = textCallback('from-adapter')
      let inputWaits = 0
      const ctx = createServerToolContext({
        era: '2025',
        waitForInput: async () => {
          inputWaits += 1
          return 'Paris'
        },
        clientSample: client.fn,
        sample: adapter.fn,
      })

      await expect(ctx.sample(summaryRequest)).resolves.toBe('from-client')
      expect(client.requests).toEqual([summaryRequest])
      expect(adapter.requests).toEqual([])
      expect(inputWaits).toBe(0)
    })

    it('calls the sample adapter and does not ask the client', async () => {
      const client = textCallback('from-client')
      const adapter = textCallback('from-adapter')
      // Era 2026 has no client sampling. The adapter is the only source.
      const ctx = createServerToolContext({
        era: '2026',
        sample: adapter.fn,
      })

      await expect(ctx.sample(summaryRequest)).resolves.toBe('from-adapter')
      expect(adapter.requests).toEqual([summaryRequest])
      expect(client.requests).toEqual([])
    })

    it('throws when the 2026 sample adapter is missing', async () => {
      const ctx = createServerToolContext({
        era: '2026',
      })

      const error = await rejectionOf(ctx.sample(summaryRequest))

      expect(error).toBeInstanceOf(Error)
      if (!(error instanceof Error)) {
        throw new Error('expected an Error')
      }
      expect(error.message).toContain('sample')
    })
  })
})
