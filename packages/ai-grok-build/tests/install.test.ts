import { describe, expect, it } from 'vitest'
import { GROK_CLI_INSTALL_COMMAND } from '../src/install'

describe('GROK_CLI_INSTALL_COMMAND', () => {
  it('uses the official x.ai install script with a GCS fallback', () => {
    expect(GROK_CLI_INSTALL_COMMAND).toContain(
      'curl -fsSL https://x.ai/cli/install.sh',
    )
    expect(GROK_CLI_INSTALL_COMMAND).toContain(
      'https://storage.googleapis.com/grok-build-public-artifacts/cli/install.sh',
    )
  })
})
