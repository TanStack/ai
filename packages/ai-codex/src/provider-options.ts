import type {
  ApprovalMode,
  ModelReasoningEffort,
  SandboxMode,
} from '@openai/codex-sdk'

/**
 * Per-call provider options for the Codex adapter, passed via `modelOptions`
 * on `chat()`.
 */
export interface CodexTextProviderOptions {
  /**
   * Resume an existing Codex thread. The adapter emits the thread id of
   * every fresh run via a CUSTOM `codex.session-id` stream event; thread it
   * back here to continue that session (only the latest user message is
   * sent — the harness already holds the prior context).
   */
  sessionId?: string
  /** Per-call override of the configured sandbox mode. */
  sandboxMode?: SandboxMode
  /** Per-call override of the configured approval policy. */
  approvalPolicy?: ApprovalMode
  /** Per-call override of the model reasoning effort. */
  modelReasoningEffort?: ModelReasoningEffort
  /** Per-call override of the harness working directory. */
  workingDirectory?: string
  /** Per-call override of the git-repo safety check (defaults to skipping). */
  skipGitRepoCheck?: boolean
}
