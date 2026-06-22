# Container image for the Cloudflare sandbox that the agent run executes inside.
#
# It extends the official @cloudflare/sandbox base image (which ships the
# in-container control server on port 3000 — exec/files/processes/ports — that
# the SandboxHandle in @tanstack/ai-sandbox-cloudflare drives) and adds the
# Claude Code CLI so the in-sandbox harness can run.
#
# Pin the base tag to the @cloudflare/sandbox version in package.json so the
# control-server protocol matches the SDK the Worker is built against.
FROM docker.io/cloudflare/sandbox:0.12.1

# The Claude Code CLI. `node` + `npm` are already on the base image.
RUN npm install -g @anthropic-ai/claude-code && claude --version

# NOTE: the Cloudflare sandbox has no writable host→process stdin
# (`capabilities.writableStdin: false`). The Claude Code adapter detects this and
# feeds the prompt via a file + in-shell stdin-redirection (`claude -p … < file`)
# instead of a host stdin write, so Claude Code runs here unchanged. See
# packages/ai-sandbox-cloudflare/src/handle.ts and the README "Limitations".

# The base image already EXPOSEs 3000 and sets the sandbox ENTRYPOINT; we only
# layer tools on top, so no CMD/ENTRYPOINT override is needed.
