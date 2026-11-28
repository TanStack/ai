import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { SecureMcpError } from './types'
import type { AnyServerTool, ToolExecutionContext } from '@tanstack/ai'
import type { ApprovalStore } from './approval'
import type { AuditLog } from './audit'
import type { EgressFetch } from './egress'
import type { AccessPolicy, ClientRecord, SecurityNotifier } from './types'

/**
 * The per-request values the envelope injects into `ctx.context`. A tool should
 * reach the network only through `ctx.context.egress`, which refuses any origin
 * off the allowlist. This is a helper, not an enforced boundary: a tool that
 * calls global `fetch` directly bypasses it. The guard reads `secure` to know
 * the caller.
 */
export interface SecureRequestContext {
  secure: { client: ClientRecord }
  egress: EgressFetch
}

/** The tool context a guarded call receives. */
export type GuardContext =
  | ToolExecutionContext<SecureRequestContext>
  | undefined

interface GuardDeps {
  policy: AccessPolicy
  approvals: ApprovalStore<GuardContext>
  audit?: AuditLog
  notify: SecurityNotifier
  summarize: (toolName: string, args: unknown) => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Reads the verified client the outer fetch injected into the tool context. */
function readClient(context: GuardContext): ClientRecord {
  // Typed as present, but a misuse could still leave it out at runtime.
  const client = context?.context?.secure?.client
  if (client === undefined) {
    throw new SecureMcpError(
      'auth_failure',
      'The request is not authenticated.',
    )
  }
  return client
}

/**
 * Wraps each tool with the access guard: scope, then target allowlist, then
 * two-phase approval, then the call. Each outcome is recorded when an audit
 * log is set. A refusal also pings the notifier.
 *
 * It throws `invalid_input` when the policy names a tool that is not in
 * `tools`, or a tool has no `execute`. A misspelt name would otherwise leave
 * the real tool with no scope check and no approval.
 */
export function guardTools(
  tools: ReadonlyArray<AnyServerTool>,
  deps: GuardDeps,
): Array<AnyServerTool> {
  const names = new Set(tools.map((tool) => tool.name))
  const unknown = [
    ...Object.keys(deps.policy.scopes ?? {}),
    ...Object.keys(deps.policy.targetParam ?? {}),
    ...(deps.policy.approve ?? []),
  ].filter((name) => !names.has(name))
  if (unknown.length > 0) {
    throw new SecureMcpError(
      'invalid_input',
      `The policy names tools that are not in \`tools\`: ${[...new Set(unknown)].join(', ')}.`,
    )
  }
  return tools.map((tool) => {
    const original = tool.execute
    if (original === undefined) {
      throw new SecureMcpError(
        'invalid_input',
        `Tool "${tool.name}" has no execute function.`,
      )
    }
    const execute = async (
      args: unknown,
      context?: ToolExecutionContext<SecureRequestContext>,
    ): Promise<unknown> => {
      const client = readClient(context)

      // `runContext` is the context of the call that runs the action. For an
      // approved tool that is the confirm call, not the propose call.
      const runAndAudit = async (
        runContext: GuardContext,
      ): Promise<unknown> => {
        let result: unknown
        try {
          result = await original(args, runContext)
        } catch (error) {
          await deps.audit?.record({
            client: client.id,
            event: 'tool_call',
            tool: tool.name,
            outcome: 'error',
            code: error instanceof SecureMcpError ? error.code : undefined,
            args,
          })
          throw error
        }
        // The action already ran. If this audit write fails, still return the
        // result: an error here would make the client retry and run the
        // action twice.
        await deps.audit
          ?.record({
            client: client.id,
            event: 'tool_call',
            tool: tool.name,
            outcome: 'ok',
            args,
          })
          .catch(() => {})
        return result
      }

      const scope = deps.policy.scopes?.[tool.name]
      if (scope !== undefined && !client.scopes.includes(scope)) {
        return refuse(
          deps,
          client,
          tool.name,
          args,
          'forbidden_scope',
          `This token does not hold the "${scope}" scope.`,
        )
      }

      const targetField = deps.policy.targetParam?.[tool.name]
      if (targetField !== undefined && client.targets !== undefined) {
        const value = isRecord(args) ? args[targetField] : undefined
        // Only a string can name a target. `String(['kitchen'])` is
        // `'kitchen'`, so a coerced array would pass the list.
        if (typeof value !== 'string' || !client.targets.includes(value)) {
          return refuse(
            deps,
            client,
            tool.name,
            args,
            'forbidden_scope',
            'This token may not reach that target.',
          )
        }
      }

      if (deps.policy.approve?.includes(tool.name)) {
        const summary = deps.summarize(tool.name, args)
        const envelope = deps.approvals.propose({
          owner: client.id,
          summary,
          // The proposal is consumed single-use before this runs, so the run
          // audits its own outcome.
          run: runAndAudit,
        })
        await deps.audit?.record({
          client: client.id,
          event: 'tool_proposed',
          tool: tool.name,
          outcome: 'ok',
          args,
        })
        void deps.notify.notify({
          kind: 'approval_pending',
          proposalId: envelope.proposalId,
          summary,
        })
        return envelope
      }

      return runAndAudit(context)
    }
    // An approval-gated tool returns the `approval_required` envelope on the
    // first call, not its own output shape. Keeping an `outputSchema` would make
    // the MCP server reject that envelope as a schema mismatch, so the client
    // would never receive the `proposalId` the confirm tool needs. Drop it.
    if (deps.policy.approve?.includes(tool.name)) {
      const { outputSchema: _outputSchema, ...rest } = tool
      return { ...rest, execute }
    }
    return { ...tool, execute }
  })
}

async function refuse(
  deps: GuardDeps,
  client: ClientRecord,
  tool: string,
  args: unknown,
  code: 'forbidden_scope',
  message: string,
): Promise<never> {
  // Notify first: a failing audit write must not silence the tripwire.
  void deps.notify.notify({ kind: 'forbidden_scope', client: client.id, tool })
  await deps.audit?.record({
    client: client.id,
    event: 'tool_call',
    tool,
    outcome: 'denied',
    code,
    args,
  })
  throw new SecureMcpError(code, message)
}

/**
 * Builds the `approve_proposal` tool. A client confirms its own pending
 * proposal by id; the stored action then runs host-side, with the context of
 * this confirm call.
 */
export function createConfirmTool(deps: {
  approvals: ApprovalStore<GuardContext>
  audit?: AuditLog
}): AnyServerTool {
  const tool: AnyServerTool = toolDefinition({
    name: 'approve_proposal',
    description:
      'Confirm a pending approval by its proposalId. Runs the proposed action.',
    inputSchema: z.object({
      proposalId: z
        .string()
        .describe('The id from an approval_required reply.'),
    }),
  }).server<SecureRequestContext>(async ({ proposalId }, context) => {
    const client = readClient(context)
    const result = await deps.approvals.confirm(proposalId, client.id, context)
    // The action already ran, and the proposal is spent. If this audit write
    // fails, still return the result: the client could not retry.
    await deps.audit
      ?.record({
        client: client.id,
        event: 'approval_confirmed',
        outcome: 'ok',
        args: { proposalId },
      })
      .catch(() => {})
    return { confirmed: true, result }
  })
  return tool
}
