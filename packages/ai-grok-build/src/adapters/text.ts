import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  SandboxCapability,
  getSandbox,
  getSandboxPolicy,
  getToolBridgeProvisioner,
  getWorkspaceProjection,
  nodeHttpBridgeProvisioner,
  spawnNdjson,
} from '@tanstack/ai-sandbox'
import { buildPrompt } from '../messages/prompt'
import { translateThreadEvents } from '../stream/translate'
import { projectGrokWorkspace } from './projection'
import { mapPolicyToGrokBuildFlags } from './policy-map'
import type { GrokBuildPolicyFlags } from './policy-map'
import type { HostToolBridge, SandboxHandle } from '@tanstack/ai-sandbox'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  DefaultMessageMetadataByModality,
  Modality,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { GrokBuildModel } from '../model-meta'
import type { GrokBuildTextProviderOptions } from '../provider-options'
import type { GrokBuildThreadEvent } from '../stream/sdk-types'

const DEFAULT_WORKDIR = '/workspace'

export interface GrokBuildTextConfig {
  /** Working directory inside the sandbox. Defaults to `/workspace`. */
  cwd?: string
  /** Path/name of the grok executable inside the sandbox. Defaults to `grok`. */
  grokExecutable?: string
  /** Extra environment variables for the grok process inside the sandbox. */
  env?: Record<string, string>
  /** Emit a `file.changed` CUSTOM event with the git diff after the run (default true). */
  emitDiff?: boolean
  /** Extra raw CLI flags appended verbatim (advanced). */
  extraArgs?: Array<string>
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function bridgeToMcpConfig(bridge: HostToolBridge): string {
  return JSON.stringify({
    mcpServers: {
      [bridge.name]: {
        type: 'http',
        url: bridge.url,
        headers: { Authorization: `Bearer ${bridge.token}` },
      },
    },
  })
}

export class GrokBuildTextAdapter<
  TModel extends GrokBuildModel,
> extends BaseTextAdapter<
  TModel,
  GrokBuildTextProviderOptions,
  ReadonlyArray<Modality> & readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never
> {
  readonly name = 'grok-build' as const

  override readonly requires = [SandboxCapability] as const

  private readonly adapterConfig: GrokBuildTextConfig

  constructor(config: GrokBuildTextConfig, model: TModel) {
    super({}, model)
    this.adapterConfig = config
  }

  private sandboxFrom(
    options: TextOptions<GrokBuildTextProviderOptions>,
  ): SandboxHandle {
    const ctx = options.capabilities
    if (!ctx) {
      throw new Error(
        'Adapter "grok-build" requires a sandbox. Add withSandbox(defineSandbox({ ... })) to chat() middleware.',
      )
    }
    return getSandbox(ctx)
  }

  private workdir(options: TextOptions<GrokBuildTextProviderOptions>): string {
    return (
      options.modelOptions?.cwd ?? this.adapterConfig.cwd ?? DEFAULT_WORKDIR
    )
  }

  private buildCommand(
    options: TextOptions<GrokBuildTextProviderOptions>,
    resume: string | undefined,
    _cwd: string,
    bridge: HostToolBridge | undefined,
    policyFlags: GrokBuildPolicyFlags,
    prompt: string,
  ): string {
    const config = this.adapterConfig
    const modelOptions = options.modelOptions
    const exe = config.grokExecutable ?? 'grok'

    // Use the documented flag. Pass the prompt as the value to -p (the way the
    // real Grok Build CLI expects it for non-interactive runs).
    const args: Array<string> = ['-p', q(prompt), '--output-format', 'streaming-json']

    args.push('--model', q(this.model))

    if (resume !== undefined) args.push('--resume', q(resume))

    const maxTurns = modelOptions?.maxTurns
    if (maxTurns !== undefined) args.push('--max-turns', String(maxTurns))

    if (bridge) {
      // MCP config is passed via --mcp-config file (see caller) so the bearer
      // stays out of argv / process list.
    }

    if (policyFlags.readOnly) {
      args.push('--read-only')
    }

    for (const a of config.extraArgs ?? []) args.push(a)

    return `${exe} ${args.join(' ')}`
  }

  async *chatStream(
    options: TextOptions<GrokBuildTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const { logger } = options
    let bridge: HostToolBridge | undefined
    const tempFiles: Array<string> = []
    let cleanupSandbox: SandboxHandle | undefined
    try {
      const sandbox = this.sandboxFrom(options)
      cleanupSandbox = sandbox
      const cwd = this.workdir(options)
      const runId = options.runId ?? this.generateId()
      const threadId = options.threadId ?? this.generateId()

      const projection = options.capabilities
        ? getWorkspaceProjection(options.capabilities, { optional: true })
        : undefined
      if (projection) await projectGrokWorkspace(sandbox, projection)

      const policy = options.capabilities
        ? getSandboxPolicy(options.capabilities, { optional: true })
        : undefined

      // Bridge server tools over MCP (streamable-HTTP via DO or node:http).
      if (options.tools && options.tools.length > 0) {
        const provisioner =
          (options.capabilities
            ? getToolBridgeProvisioner(options.capabilities, { optional: true })
            : undefined) ?? nodeHttpBridgeProvisioner
        bridge = await provisioner.provision(options.tools, {
          provider: sandbox.provider,
          context: options.context,
          ...(options.abortController?.signal
            ? { signal: options.abortController.signal }
            : {}),
        })
      }

      const { prompt, resume } = buildPrompt(
        options.messages,
        options.modelOptions?.sessionId,
      )
      const systemPrompts = normalizeSystemPrompts(options.systemPrompts)
        .map((p) => p.content)
        .filter((c) => c.trim() !== '')
      const fullPrompt =
        systemPrompts.length > 0
          ? `${systemPrompts.join('\n\n')}\n\n${prompt}`
          : prompt

      // Write MCP config (if any) to a file so the bearer token is not in argv.
      let mcpConfigPath: string | undefined
      if (bridge) {
        mcpConfigPath = `${cwd}/.tanstack-grok-mcp-${runId}.json`
        await sandbox.fs.write(mcpConfigPath, bridgeToMcpConfig(bridge))
        tempFiles.push(mcpConfigPath)
      }

      const command = this.buildCommand(
        options,
        resume,
        cwd,
        bridge,
        mapPolicyToGrokBuildFlags(policy),
        fullPrompt,
      )

      // Append MCP config file (bearer stays out of argv).
      let runCommand = command
      if (mcpConfigPath !== undefined) {
        runCommand = `${command} --mcp-config ${q(mcpConfigPath)}`
      }

      // Note: prompt is passed via -p "..." (see buildCommand). We no longer
      // rely on stdin redirect for the prompt text itself for the real Grok
      // Build CLI. The MCP config is still delivered via a side file.

      logger.request(
        `activity=chat provider=grok-build model=${this.model} sandbox=${sandbox.provider} messages=${options.messages.length} resume=${resume ?? 'none'}`,
        { provider: 'grok-build', model: this.model },
      )

      // Always surface RUN_STARTED early so the UI shows activity even if the
      // real Grok Build CLI's streaming-json format doesn't match the exact
      // event shapes our translator was originally written for.
      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model: this.model,
        timestamp: Date.now(),
      }

      const rawEvents = spawnNdjson(sandbox, runCommand, {
        cwd,
        ...(this.adapterConfig.env ? { env: this.adapterConfig.env } : {}),
        ...(options.abortController?.signal
          ? { signal: options.abortController.signal }
          : options.request?.signal
            ? { signal: options.request.signal }
            : {}),
        onNonJsonLine: (line) =>
          logger.provider(`provider=grok-build non-json line: ${line}`, {
            chunk: line,
          }),
      })

      async function* asEvents(): AsyncIterable<GrokBuildThreadEvent> {
        for await (const event of rawEvents) yield event as GrokBuildThreadEvent
      }

      yield* translateThreadEvents(asEvents(), {
        model: this.model,
        runId,
        threadId,
        ...(options.parentRunId !== undefined && {
          parentRunId: options.parentRunId,
        }),
        genId: () => this.generateId(),
        onThreadEvent: (event) =>
          logger.provider(`provider=grok-build type=${event.type}`, {
            chunk: event,
          }),
      })

      // Surface working-tree diff (best effort).
      if (this.adapterConfig.emitDiff !== false) {
        try {
          const diff = await sandbox.process.exec(`git -C ${q(cwd)} diff`, {
            cwd,
          })
          if (diff.exitCode === 0 && diff.stdout.trim() !== '') {
            yield {
              type: EventType.CUSTOM,
              name: 'file.changed',
              value: { path: '.', diff: diff.stdout },
              timestamp: Date.now(),
              threadId,
              runId,
            }
          }
        } catch {
          // ignore
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { code?: string }
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('grok-build.chatStream fatal', {
        error,
        source: 'grok-build.chatStream',
      })
      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: err.message || 'Unknown error occurred',
        ...(err.code !== undefined && { code: err.code }),
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: err.message || 'Unknown error occurred',
          ...(err.code !== undefined && { code: err.code }),
        },
      }
    } finally {
      await bridge?.close()
      if (cleanupSandbox) {
        for (const path of tempFiles) {
          try {
            await cleanupSandbox.fs.remove(path)
          } catch {
            // ignore
          }
        }
      }
    }
  }

  structuredOutput(
    _options: StructuredOutputOptions<GrokBuildTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    return Promise.reject(
      new Error(
        'Structured output is not yet supported by the in-sandbox Grok Build adapter. ' +
          'Use a model adapter (e.g. grok) for structured output, or omit outputSchema.',
      ),
    )
  }
}

/**
 * Creates a Grok Build harness adapter that runs **inside a sandbox**.
 *
 * Spawns the `grok` CLI (or a configured executable) inside the sandbox
 * provided via `withSandbox(...)`. The adapter declares
 * `requires: [SandboxCapability]`. The sandbox image must provide the
 * executable and `XAI_API_KEY` (or equivalent) for the harness.
 */
export function grokBuildText<TModel extends GrokBuildModel>(
  model: TModel,
  config: GrokBuildTextConfig = {},
): GrokBuildTextAdapter<TModel> {
  return new GrokBuildTextAdapter(config, model)
}
