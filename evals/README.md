# TanStack AI context-optimization evals

Measures whether adornment-driven context projection (`@tanstack/ai-optimize`)
cuts spend without cutting accuracy, using the [Harbor](https://github.com/harbor-framework/harbor)
runner (Apache-2.0) for comparability with the Strands numbers.

**These are TypeScript numbers and say so.** No TypeScript-vs-anything claim is
made (see the brief, Part B non-goals).

## Layout

```
evals/
  README.md                         this file
  harbor/
    tanstack_ai.py                  Harbor BaseInstalledAgent adapter (E1)
    tanstack_ai_runner.mjs          the Node agent Harbor runs in the task container (E2)
    arms.mjs                        the four arms (baseline / global / adorned / universal)
    tools.mjs                       shell + file-editor tools, implemented over child_process/fs
    report.mjs                      per-trial JSONL -> per-model x arm cost table (E4)
    run-matrix.mjs                  suite x arms x tasks x trials -> results/*.jsonl
    chart.mjs                       results/*.jsonl -> results/charts/*.png (headless Chromium)
    run-config.example.json         maxTrials + hard USD cap (budget discipline)
    results/
      RESULTS.md                    findings writeup (tables + charts + recommendations)
      *.jsonl                       raw per-trial records
      charts/*.png                  rendered bar charts
    suites/
      middle-critical/generate.mjs  held-out synthetic suite generator (E3)
      agentic-coding/generate.mjs   read a large file, transform, write it back (single write)
      multi-write/generate.mjs      read+edit+write SEVERAL files in one session (write-arg drop compounds)
      code-mode/generate.mjs        same work through execute_typescript; agent logs for debugging
      terminal-bench/generate.mjs   run noisy shell commands; answer in the tail (disposable logs, the Strands regime)
```

## Arms (selected by `ARM` env, nothing else changes)

Two modes. The tool-call arms give the agent `read_file` / `write_file` (and
`run_shell` when enabled). The code-mode arms (`cm-*`) give it one tool,
`execute_typescript`, that runs its program in a QuickJS sandbox with the file
tools exposed as `external_*` functions.

| Arm           | Mode       | Middleware                                                                                                                 |
| ------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `baseline`    | tool-calls | none                                                                                                                       |
| `global`      | tool-calls | `optimize()` `defaults.mode: 'flatten'`, 1500/750 head_tail (Strands replica)                                              |
| `adorned`     | tool-calls | leaves mode + per-tool rules: drop completed `write_file.content`, clip `run_shell.stdout`, keep `read_file.content` whole |
| `universal`   | tool-calls | leaves-mode defaults only                                                                                                  |
| `cm-baseline` | code-mode  | none                                                                                                                       |
| `cm-adorned`  | code-mode  | drop completed `execute_typescript.typescriptCode`, clip `logs`                                                            |
| `cm-global`   | code-mode  | flatten the whole `execute_typescript` result (over-truncation control)                                                    |

System prompt and turn limits are held constant across arms.

## What each suite is for

- **middle-critical / agentic-coding** — a single large read/write. Proves the
  plumbing but the write-arg saving only lands on one call, so at small `n` the
  agent's step-count variance dominates.
- **multi-write** — the write-arg drop (D3) compounds: each completed
  `write_file` content lingers for the rest of the session until `adorned` drops
  it. Also the clearest place to see that full-file rewrites grow context
  quadratically.
- **code-mode** — code mode already keeps file contents in the sandbox, so the
  model context is tiny. This suite isolates what `optimize()` adds _on top of_
  code mode: clipping the debug `logs` an agent prints. `cm-baseline` carries
  every dump; `cm-adorned` clips them and keeps the returned result.
- **terminal-bench** — the disposable-log regime Strands' headline comes from:
  noisy shell commands whose answer is a summary line in the tail. Size-based
  truncation is nearly free here (~96% input cut, no retrievals). Run both this
  and `multi-write` to see the effect flip sign with the workload. See
  `results/RESULTS.md`.

## Model ladder (never Fable-anchored)

Report per model, never pooled. A frontier model is the best case for surviving
lossy context, so safety measured there is an upper bound.

- frontier: Fable 5 (`--fable` flag required, it is the most expensive cell)
- production-default: a Sonnet-class model and a GPT equivalent
- low-cost / open tier

## Budget discipline

Every run carries `maxTrials` and a hard USD cap (`run-config.json`). The runner
aborts when the cap is hit and reports partial results **as partial**. Dev
iterations use small task subsets and the cheaper tiers. Fable runs need
`--fable`.

## Running locally (smoke test, no Harbor)

The runner is self-contained and can run one task directly for a smoke test.
Keys come from `.env.local` at the repo root (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, ...).

```bash
# one task, cheapest tier, adorned arm
ARM=adorned MODEL=claude-sonnet-4-6 \
  node evals/harbor/tanstack_ai_runner.mjs --smoke evals/harbor/suites/middle-critical/out/task-000.json
```

Generate a suite first, then run a matrix across arms and trials:

```bash
# generate tasks
node evals/harbor/suites/multi-write/generate.mjs --count 3 --files 3 --out evals/harbor/suites/multi-write/out
node evals/harbor/suites/code-mode/generate.mjs  --count 3 --files 3 --out evals/harbor/suites/code-mode/out

# run suite x arms x trials -> one JSONL (sequential; bounded by TURN_LIMIT)
cd evals/harbor
TURN_LIMIT=18 node run-matrix.mjs \
  --tasks "suites/multi-write/out/task-*.json" \
  --arms baseline,adorned,universal,global,cm-baseline,cm-adorned \
  --model gemini-3.8-flash --trials 3 --out results/multi-write.jsonl \
  --max-usd 5
```

`--max-usd <n>` stops before the next request once the estimated spend (from the
`report.mjs` rate card) passes the cap, keeping the partial results. A Fable
model requires `--fable` to confirm the spend.

Summarize per-trial JSONL into the headline table:

```bash
node evals/harbor/report.mjs evals/harbor/results/*.jsonl
```

## Status

E1 (adapter) is modeled on Harbor's `langgraph.py` + `langgraphjs_runner.mjs`
precedent. The Harbor container-install contract details are marked `TODO(harbor)`
where they need to be checked against the Harbor version you pin. The runner
(E2), arms, suite generator (E3), and report (E4) are runnable today.
