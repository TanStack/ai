# Container image for the CO-LOCATED sandbox-agent model.
#
# Unlike examples/sandbox-cloudflare-agent (whose container only runs the
# `claude` CLI, driven from the DO), THIS image also ships the in-container
# HARNESS RUNNER (src/container-runner.ts, bundled). That ~6-line program just
# calls `runInContainerHarness()` from `@tanstack/ai-sandbox-cloudflare/runner`,
# which runs `chat()` + the MCP tool-bridge ON the container's own localhost —
# the whole point of the co-located model.
#
# It extends the official @cloudflare/sandbox base image (which ships the
# in-container CONTROL server on port 3000 — exec/files/processes/ports — that
# the @cloudflare/sandbox SDK drives, and sets the container ENTRYPOINT). Pin
# the base tag to the @cloudflare/sandbox version in package.json so the
# control-server protocol matches the SDK the Worker is built against.
FROM docker.io/cloudflare/sandbox:0.12.1

# The Claude Code CLI. `node` + `npm` are already on the base image.
RUN npm install -g @anthropic-ai/claude-code && claude --version

# The BUNDLED in-container runner. Build it first on the host with:
#   pnpm build:runner      # esbuild → dist/container-runner.mjs (single ESM file)
# It is bundled (not `npm install`ed) so the image stays self-contained and the
# workspace `@tanstack/*` deps (incl. the package's `/runner` entry) are inlined.
# The DO starts it via the sandbox control server
# (`startProcess "node /app/container-runner.mjs"`), then reaches it on
# RUNNER_PORT with containerFetch — see the package's ContainerSandboxCoordinator
# (`@tanstack/ai-sandbox-cloudflare/agent`) ensureRunner().
COPY dist/container-runner.mjs /app/container-runner.mjs

# IN-CONTAINER LOCAL-PROCESS HAS WRITABLE STDIN. Because the runner uses
# localProcessSandbox() (the container IS the host), the Claude Code adapter
# feeds the prompt to `claude` over NATIVE stdin — no file-redirect, and the MCP
# bridge URL/token never leave the container. (Contrast the non-co-located
# example, where the Cloudflare sandbox has no writable host→process stdin.)

# The base image already EXPOSEs 3000 (control) and sets the ENTRYPOINT. We do
# NOT override the entrypoint (that would break the sandbox SDK); the runner is
# started as a process by the DO. We document the runner port for clarity.
EXPOSE 8080
