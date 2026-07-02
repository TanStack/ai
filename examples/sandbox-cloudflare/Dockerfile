# Container image for the Cloudflare sandbox that the agent run executes inside.
#
# It extends the official @cloudflare/sandbox base image (which ships the
# in-container control server on port 3000 — exec/files/processes/ports — that
# the SandboxHandle in @tanstack/ai-sandbox-cloudflare drives) and adds the
# coding-agent CLIs so any harness this example supports can run.
#
# All three CLIs are baked in so the `HARNESS` var (see src/agent.ts) can select
# one at run time without rebuilding the image. The unused CLIs just sit on disk.
#
# Pin the base tag to the @cloudflare/sandbox version in package.json so the
# control-server protocol matches the SDK the Worker is built against.
FROM docker.io/cloudflare/sandbox:0.12.2

# Claude Code CLI (HARNESS=claude-code). `node` + `npm` are already on the base
# image. `--include=optional` is required: the CLI's native binary ships as a
# platform-specific OPTIONAL dependency, and a plain `-g` install can skip it,
# leaving a `claude` that errors "native binary not installed".
RUN npm install -g @anthropic-ai/claude-code --include=optional && claude --version

# OpenAI Codex CLI (HARNESS=codex). `--include=optional` for the same reason —
# codex's native binary is a platform-specific optional dep.
RUN npm install -g @openai/codex --include=optional && codex --version

# Grok Build CLI (HARNESS=grok) — installed as documented at https://x.ai/cli.
# The installer drops the binary at /root/.grok/bin/grok; symlink it onto PATH so
# the harness adapter (which invokes `grok`) resolves it.
RUN curl -fsSL https://x.ai/cli/install.sh | bash \
 && ln -sf /root/.grok/bin/grok /usr/local/bin/grok \
 && grok --version || true

# NOTE: the Cloudflare sandbox has no writable host→process stdin
# (`capabilities.writableStdin: false`). Each harness adapter detects this and
# feeds the prompt via a file + in-shell stdin-redirection (e.g.
# `claude -p … < file`, `codex exec … < file`) instead of a host stdin write, so
# every harness runs here unchanged. See
# packages/ai-sandbox-cloudflare/src/handle.ts and the README "Limitations".

# The base image already EXPOSEs 3000 and sets the sandbox ENTRYPOINT; we only
# layer tools on top, so no CMD/ENTRYPOINT override is needed.
