export interface CodexTextProviderOptions {
  sessionId?: string
  /** Per-call override of the configured sandbox mode. */
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'
  /** Per-call override of the configured approval policy. */
  approvalPolicy?: 'never' | 'on-failure' | 'on-request' | 'untrusted'
  /** Per-call override of the model reasoning effort. */
  modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  /** Per-call override of the harness working directory. */
  workingDirectory?: string
  /** Per-call override of the git-repo safety check (defaults to skipping). */
  skipGitRepoCheck?: boolean
  authMode?: 'host' | 'api-key'
}
