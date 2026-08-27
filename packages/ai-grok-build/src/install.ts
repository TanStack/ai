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
