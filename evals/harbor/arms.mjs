// The eval arms (E2). An arm is a mode (tool-calls vs code-mode) plus an
// optimize() config (or none). System prompt and turn limits are held constant
// by the runner; only the mode + middleware change between arms.

import {
  truncateHeadTail,
  dropWithRef,
  aboveTokens,
} from '@tanstack/ai-optimize'

const HEAD_TAIL = aboveTokens(1500, truncateHeadTail({ maxTokens: 750 }))

// --- tool-call arms ---------------------------------------------------------
// Author-adorned rules for the runner's own file tools:
//  - write_file.content is redundant once the file is on disk -> drop the
//    completed call's args from history (D3). This is the big, safe saving, and
//    it compounds across a multi-write session.
//  - run_shell.stdout is a log -> safe to clip.
//  - read_file.content is load-bearing while editing -> keep it WHOLE. Pin an
//    effectively-infinite threshold so the leaves-mode default can never clip it.
const KEEP_WHOLE = aboveTokens(
  1_000_000_000,
  truncateHeadTail({ maxTokens: 750 }),
)
const ADORNED_TOOL_RULES = {
  write_file: { args: { fields: { content: dropWithRef() } } },
  run_shell: { result: { fields: { stdout: HEAD_TAIL } } },
  read_file: { result: { fields: { content: KEEP_WHOLE } } },
}

// --- code-mode arms ---------------------------------------------------------
// In code mode the only visible tool is execute_typescript. The program source
// (`typescriptCode`) is write-once-run-once: after it executes the model needs
// the *result*, not the source it already submitted — exactly the write_file
// story. `logs` is console spam, safe to clip. This is the whole code-mode
// thesis: every bundled program evaporates from history once it has run.
const CODE_MODE_ADORNED_RULES = {
  execute_typescript: {
    args: { fields: { typescriptCode: dropWithRef() } },
    result: { fields: { logs: HEAD_TAIL } },
  },
}

// Each arm: { codeMode, config }. `config` is the optimize() config (null = none).
const ARM_SPECS = {
  baseline: { codeMode: false, config: null },
  // Strands replica: flatten every result, 1500/750 head_tail, errors exempt.
  global: {
    codeMode: false,
    config: { defaults: { projection: HEAD_TAIL, mode: 'flatten' } },
  },
  adorned: {
    codeMode: false,
    config: {
      defaults: { projection: HEAD_TAIL, mode: 'leaves' },
      tools: ADORNED_TOOL_RULES,
    },
  },
  universal: {
    codeMode: false,
    config: { defaults: { projection: HEAD_TAIL, mode: 'leaves' } },
  },
  // Code-mode arms: same workload, run via execute_typescript.
  'cm-baseline': { codeMode: true, config: null },
  'cm-adorned': { codeMode: true, config: { tools: CODE_MODE_ADORNED_RULES } },
  'cm-global': {
    codeMode: true,
    config: { defaults: { projection: HEAD_TAIL, mode: 'flatten' } },
  },
}

/** Returns the spec { codeMode, config } for an arm. */
export function armSpec(arm) {
  const spec = ARM_SPECS[arm]
  if (!spec)
    throw new Error(
      `Unknown arm "${arm}". Use one of: ${Object.keys(ARM_SPECS).join(', ')}.`,
    )
  return spec
}

/** Back-compat: just the optimize() config (or null) for an arm. */
export function armConfig(arm) {
  return armSpec(arm).config
}

export const ARMS = Object.keys(ARM_SPECS)
export const TOOL_ARMS = ARMS.filter((a) => !ARM_SPECS[a].codeMode)
export const CODE_MODE_ARMS = ARMS.filter((a) => ARM_SPECS[a].codeMode)
