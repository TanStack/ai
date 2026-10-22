import { test, expect } from './fixtures'

/**
 * Wire format of OpenAI computer use. The model sends a `computer_call`, the
 * app runs it, and the next request sends the call back with its
 * `computer_call_output`.
 *
 * `/api/openai-computer-use-wire` serves the model responses with a custom
 * `fetch` and returns the tool inputs and the request bodies as JSON.
 */
test.describe('openai — computer use wire format', () => {
  test('runs the computer call and sends the screenshot back', async ({
    request,
  }) => {
    const res = await request.post('/api/openai-computer-use-wire')
    expect(res.ok()).toBe(true)
    const { ok, error, toolInputs, requestBodies } = (await res.json()) as {
      ok: boolean
      error?: string
      toolInputs: Array<unknown>
      requestBodies: Array<{ input: Array<unknown> }>
    }

    if (!ok) {
      throw new Error(`Route failed: ${error}`)
    }

    const safetyCheck = {
      id: 'sc_e2e',
      code: 'malicious_instructions',
      message: 'The page asks the model to do something else.',
    }
    expect(toolInputs).toEqual([
      {
        action: { type: 'click', button: 'left', x: 10, y: 20 },
        pending_safety_checks: [safetyCheck],
      },
    ])
    expect(requestBodies).toHaveLength(2)
    expect(requestBodies[1]!.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'computer_call',
          call_id: 'call_cu_e2e',
          action: { type: 'click', button: 'left', x: 10, y: 20 },
        }),
        {
          type: 'computer_call_output',
          call_id: 'call_cu_e2e',
          output: {
            type: 'computer_screenshot',
            image_url: 'data:image/png;base64,iVBORw0KGgo=',
            detail: 'original',
          },
          acknowledged_safety_checks: [safetyCheck],
        },
      ]),
    )
  })

  test('runs the batched actions of the computer tool', async ({ request }) => {
    const res = await request.post(
      '/api/openai-computer-use-wire?tool=computer',
    )
    expect(res.ok()).toBe(true)
    const { ok, error, toolInputs, requestBodies } = (await res.json()) as {
      ok: boolean
      error?: string
      toolInputs: Array<unknown>
      requestBodies: Array<{ tools?: Array<unknown>; input: Array<unknown> }>
    }

    if (!ok) {
      throw new Error(`Route failed: ${error}`)
    }

    const actions = [
      { type: 'click', button: 'left', x: 10, y: 20 },
      { type: 'type', text: 'hello' },
    ]
    expect(toolInputs).toEqual([{ actions, pending_safety_checks: [] }])
    expect(requestBodies).toHaveLength(2)
    expect(requestBodies[0]!.tools).toEqual([{ type: 'computer' }])
    expect(requestBodies[1]!.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'computer_call',
          call_id: 'call_cu_e2e_batch',
          actions,
        }),
        {
          type: 'computer_call_output',
          call_id: 'call_cu_e2e_batch',
          output: {
            type: 'computer_screenshot',
            image_url: 'data:image/png;base64,iVBORw0KGgo=',
            detail: 'original',
          },
        },
      ]),
    )
  })
})
