/**
 * Grok CLI install for sandbox bootstrap.
 *
 * Primary: {@link https://x.ai/cli/install.sh} (official).
 * Fallback: GCS mirror used by the installer when x.ai is unreachable — needed
 * on Daytona and other sandboxes whose egress firewall blocks `x.ai` but allows
 * `storage.googleapis.com` (Daytona essential service).
 *
 * @see https://x.ai/cli
 * @see https://docs.x.ai/build/overview#install
 */
const GROK_INSTALL_SCRIPT_PRIMARY = 'https://x.ai/cli/install.sh'
const GROK_INSTALL_SCRIPT_FALLBACK =
  'https://storage.googleapis.com/grok-build-public-artifacts/cli/install.sh'

export const GROK_CLI_INSTALL_COMMAND =
  '(curl -fsSL ' +
  GROK_INSTALL_SCRIPT_PRIMARY +
  ' || curl -fsSL ' +
  GROK_INSTALL_SCRIPT_FALLBACK +
  ') | bash && ' +
  '"$HOME/.grok/bin/grok" --version </dev/null'