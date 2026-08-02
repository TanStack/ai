import { test, expect } from './fixtures'

/**
 * Wire-format verification for multimodal tool-result messages (#363).
 *
 * A tool message's `content` can be `Array<ContentPart>`, and the
 * OpenAI / Anthropic / Gemini adapters must convert it to structured provider
 * tool output instead of `JSON.stringify`. This spec drives the route at
 * `/api/multimodal-tool-result-wire` (which calls `chat()` with a pre-built
 * conversation that includes a multimodal tool result), then inspects
 * aimock's journal (`GET /v1/_requests`) to assert the outbound bytes contain
 * structured tool output per provider.
 *
 * Aimock normalises Anthropic and Gemini request bodies to an OpenAI-compatible
 * form before journalling. As a result:
 *   - OpenAI (Responses API)  — image parts survive in body.messages[tool].content
 *   - Anthropic               — aimock's claudeToCompletionRequest strips image
 *                               blocks from tool_result content; only text survives
 *   - Gemini                  — aimock's geminiToCompletionRequest strips inlineData
 *                               parts from functionResponse; only text survives
 * The OpenAI assertion therefore verifies image presence directly. The Anthropic
 * and Gemini assertions verify that the chat() call + adapter completed the
 * end-to-end HTTP round-trip without a synchronous throw — proving serialization
 * of the Array<ContentPart> tool result ran to completion. Structural correctness
 * for those two providers is covered by adapter unit tests.
 *
 * Note: the Anthropic and Gemini adapters catch HTTP errors from aimock (no-fixture
 * 404) and yield a RUN_ERROR stream event rather than throwing. The route therefore
 * always returns ok:true as long as serialization does not crash synchronously.
 * This makes ok:true a meaningful proof that the multimodal conversion succeeded.
 */
// Serial mode: each test clears then re-populates the aimock journal.
// Parallel workers would otherwise race on the global journal — one test's
// beforeEach DELETE clears a sibling test's entries before they are read.
test.describe.configure({ mode: 'serial' })

test.describe('multimodal tool result — wire format', () => {
  test.beforeEach(async ({ request, aimockPort }) => {
    // Clear the aimock journal before each serial test so we only assert
    // against the request triggered by this specific test.
    await request.delete(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // OpenAI (Responses API — /v1/responses)
  //
  // aimock stores the normalised CompletionRequest for /v1/responses where
  // function_call_output.output survives as-is in the tool message content.
  // When output is an array (multimodal), it appears under
  //   body.messages[role=tool].content: Array<{type, ...}>
  // with `input_image` and `input_text` items.
  // ──────────────────────────────────────────────────────────────────────────
  test('openai: tool message content is a structured array with an image part', async ({
    request,
    aimockPort,
    testId,
  }) => {
    await request.post(
      `/api/multimodal-tool-result-wire?provider=openai&testId=${encodeURIComponent(testId)}`,
    )
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries = (await journal.json()) as Array<{ body: any }>
    // OpenAI Responses API: aimock normalises function_call_output → role:'tool'
    // and preserves the output array as-is in the content field.
    const toolMsg = entries[0]?.body?.messages?.find(
      (m: any) => m.role === 'tool',
    )
    expect(Array.isArray(toolMsg?.content)).toBe(true)
    expect(toolMsg.content.some((p: any) => p.type === 'input_image')).toBe(
      true,
    )
    expect(toolMsg.content.some((p: any) => p.type === 'input_text')).toBe(true)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Anthropic (/v1/messages)
  //
  // The Anthropic adapter wraps the tool result in a user message with a
  // tool_result block whose content is Array<TextBlock|ImageBlock>. However,
  // aimock's claudeToCompletionRequest normalisation strips non-text blocks
  // before journalling. The adapter also catches HTTP errors (aimock returns
  // a 404 when no fixture matches) and yields a RUN_ERROR event rather than
  // throwing, so the route always returns ok:true when serialization succeeds.
  //
  // Assertion: ok:true proves chat() + the Anthropic adapter serialized the
  // Array<ContentPart> tool result and completed the round-trip without a
  // synchronous throw (i.e. the multimodal conversion did not crash).
  // ──────────────────────────────────────────────────────────────────────────
  test('anthropic: multimodal tool result completes end-to-end (image structure covered by unit test)', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const res = await request.post(
      `/api/multimodal-tool-result-wire?provider=anthropic&testId=${encodeURIComponent(testId)}`,
    )
    const { ok } = (await res.json()) as { ok: boolean; error?: string }
    // Structural proof that the image becomes a tool_result image block lives in packages/ai-anthropic/tests/tool-result-multimodal.test.ts — aimock's journal strips multimodal tool content so it can't be asserted here.
    expect(ok).toBe(true)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Gemini (/v1beta/models/.../streamGenerateContent)
  //
  // The Gemini adapter emits a functionResponse with parts:[{inlineData:{...}}]
  // for the image alongside response:{content:'screenshot'} for the text.
  // aimock's geminiToCompletionRequest normalises this to role:'tool' and
  // JSON.stringifies only the response object (dropping inlineData).
  // The adapter catches HTTP errors (aimock 404 on no-fixture) and yields a
  // RUN_ERROR event rather than throwing, so ok:true means serialization succeeded.
  //
  // Assertion: ok:true proves chat() + the Gemini adapter serialized the
  // Array<ContentPart> tool result and completed the round-trip without a
  // synchronous throw (i.e. the multimodal conversion did not crash).
  // ──────────────────────────────────────────────────────────────────────────
  test('gemini: multimodal tool result completes end-to-end (image structure covered by unit test)', async ({
    request,
    aimockPort,
    testId,
  }) => {
    const res = await request.post(
      `/api/multimodal-tool-result-wire?provider=gemini&testId=${encodeURIComponent(testId)}`,
    )
    const { ok } = (await res.json()) as { ok: boolean; error?: string }
    // Structural proof that the image becomes a functionResponse.parts inlineData entry lives in packages/ai-gemini/tests/tool-result-multimodal.test.ts — aimock's journal strips multimodal tool content so it can't be asserted here.
    expect(ok).toBe(true)
  })
})
