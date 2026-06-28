# Container image for the Cloudflare sandbox that the agent run executes inside.
#
# It extends the official @cloudflare/sandbox base image (which ships the
# in-container control server on port 3000 — exec/files/processes/ports — that
# the SandboxHandle in @tanstack/ai-sandbox-cloudflare drives) and adds the
# Grok Build CLI so the in-sandbox harness can run.
#
# Pin the base tag to the @cloudflare/sandbox version in package.json so the
# control-server protocol matches the SDK the Worker is built against.

FROM docker.io/cloudflare/sandbox:0.12.1

# The Grok Build CLI — installed exactly as documented on the Grok Build site.
# See https://x.ai/cli and https://docs.x.ai/build/overview
RUN curl -fsSL https://x.ai/cli/install.sh | bash

# The installer places the binary at ~/.grok/bin/grok (for root: /root/.grok/bin/grok).
# Symlink to /usr/local/bin so `grok` is on PATH (matching how the harness adapter invokes it).
RUN ln -sf /root/.grok/bin/grok /usr/local/bin/grok || true

# Verify the CLI is present (full functionality requires XAI_API_KEY at runtime).
RUN grok --version || true

# NOTE: the Cloudflare sandbox has no writable host→process stdin
# (`capabilities.writableStdin: false`). The Grok Build adapter detects this and
# feeds the prompt via a file + in-shell stdin-redirection instead of a host
# stdin write.
#
# Auth: The grok CLI authenticates headlessly via XAI_API_KEY (injected into the
# sandbox env by src/agent.ts).

# The base image already EXPOSEs 3000 and sets the sandbox ENTRYPOINT; we only
# layer tools on top, so no CMD/ENTRYPOINT override is needed.
