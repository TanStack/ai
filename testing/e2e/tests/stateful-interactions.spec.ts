import { test } from './fixtures'
import { providersFor } from './test-matrix'

// E2E coverage for Gemini's stateful Interactions API (geminiTextInteractions).
// Currently skipped because @copilotkit/aimock does not yet record/replay
// Gemini's interactions:create endpoint — adding that support is a separate
// workstream.
//
// Adapter-level correctness (stream translation, previous_interaction_id
// round-trip, tool-call event emission, RUN_FINISHED.providerMetadata.interactionId,
// error handling) is covered exhaustively by the unit suite at
// packages/typescript/ai-gemini/tests/text-interactions-adapter.test.ts.
//
// Once aimock can proxy or replay /v1beta/.../interactions, this spec should:
//   1. Issue a first chat call; read the returned interactionId from
//      RUN_FINISHED.providerMetadata.
//   2. Send a second call passing that id via
//      providerOptions.previous_interaction_id and assert the model's reply
//      references context from the first turn while the outbound request body
//      omits prior history.
for (const provider of providersFor('stateful-interactions')) {
  test.describe(`${provider} — stateful-interactions`, () => {
    test.skip(
      'two-turn conversation chained via previous_interaction_id',
      () => {
        // TODO(tanstack/ai#501 follow-up): implement once aimock supports
        // Gemini's interactions:create endpoint.
      },
    )
  })
}
