/**
 * The IN-CONTAINER harness runner, bundled into the image (see Dockerfile) and
 * started by the DO. The server + `chat()` wiring lives in the package; this app
 * supplies only the adapter to build for a given `{ harness, model }`.
 *
 * NOTE: container-side Node code — not runtime-verified here (no container build
 * in CI). See the README.
 */
import { runInContainerHarness } from '@tanstack/ai-sandbox-cloudflare/runner'
import { claudeCodeText } from '@tanstack/ai-claude-code'

runInContainerHarness({
  resolveAdapter: ({ model }) => claudeCodeText(model),
})
