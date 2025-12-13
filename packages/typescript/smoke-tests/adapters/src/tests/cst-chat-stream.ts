import { runTestCase } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * CST: Chat Stream Test
 *
 * Tests basic streaming chat completion by asking a simple question
 * and verifying the response contains the expected answer.
 */
export async function runCST(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  return runTestCase({
    adapterContext,
    testName: 'cst-chat-stream',
    description: 'chat stream returns Paris for capital of France',
    messages: [
      { role: 'user' as const, content: 'what is the capital of france' },
    ],
    validate: (run) => {
      const hasParis = run.fullResponse.toLowerCase().includes('paris')
      return {
        passed: hasParis,
        error: hasParis ? undefined : "Response does not contain 'Paris'",
        meta: { hasParis },
      }
    },
  })
}
