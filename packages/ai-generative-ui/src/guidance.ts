/**
 * Open Generative UI Specification (Draft 0.1)
 * Shared composition guidance for live drivers (§7.3).
 *
 * Any producer that asks a model to compose a graph — the web middleware, an
 * MCP server exposing `render_ui`, a future constructor driver — needs the same
 * catalog/compute/wiring rules. Keeping them here, next to the catalog and the
 * compute registry they describe, is the single source of truth so the rules
 * cannot drift between producers.
 */

import type { ComputeRegistry } from './compute'
import { defaultComputeRegistry, describeComputeForPrompt } from './compute'

/**
 * The catalog + safety + deterministic-compute + wiring rules a model must
 * follow to compose a valid, interactive, correctly-computed graph. Suitable
 * as the body of a system prompt (web) or a `render_ui` tool description (MCP),
 * where there is no separate system prompt to carry it.
 */
export function renderUICompositionGuidance(
  registry: ComputeRegistry = defaultComputeRegistry,
): string {
  return `The UI graph must be composed only from catalog components:
   - Layout: Stack, Columns, Section, Tabs, Timeline
   - Content: Text, Image, Table, List, Metric, Chart, Map, Diagram, Callout
   - Input: Form, TextInput, NumberInput, Select, Slider, Stepper, Toggle, Checkbox, Checklist, Button, Choice
   - Vector Scene: Scene (props must include "viewBox", e.g. "0 0 300 360", and "shapes": Array<{ kind: "rect"|"circle"|"line"|"text"|"path", ... }>. ALWAYS put vector shapes inside props.shapes, not in children. Use semantic paint roles: "accent", "neutral", "muted", "surface", "danger", "highlight", or "none")
Safety: No arbitrary HTML, scripts, CSS strings, or execution handlers.
Deterministic computation: If values are computed (e.g. loan payments, bill splits, taxes), DO NOT author arithmetic in text and DO NOT require a button click. Attach a REACTIVE "compute" to a CONTAINER node (Stack/Section/Form) so results update live as inputs change. Shape: "compute": { "name", "inputs": { fnInput: "stateKey" }, "output": "resultKey" }. Only use functions from this list — inventing a name means nothing computes:
${describeComputeForPrompt(registry)}
   Wiring rules:
   - Give every input (NumberInput/Slider/etc.) an explicit "bind": { "value": "someKey" } and set its starting number via props.value. Reference that SAME "someKey" in the compute inputs.
   - A compute output that is an object is written at output + flattened to the root. A Metric shows a computed number via "bind": { "value": "resultKey.fieldName" } — NEVER put the reference in props.value (props.value is for literal starting numbers on inputs only).
   - Button/label text goes in the "label" prop (not "text").
   Worked example — a live mortgage calculator (copy this wiring exactly, only changing numbers/labels):
   {
     "id": "calc", "type": "Stack",
     "compute": { "name": "loanPayment", "inputs": { "loanAmount": "loanAmount", "annualInterestRate": "annualInterestRate", "termYears": "termYears" }, "output": "loan" },
     "children": [
       { "id": "amt", "type": "NumberInput", "props": { "label": "Loan Amount ($)", "value": 400000 }, "bind": { "value": "loanAmount" } },
       { "id": "rate", "type": "NumberInput", "props": { "label": "Annual Interest Rate (%)", "value": 6.5 }, "bind": { "value": "annualInterestRate" } },
       { "id": "term", "type": "NumberInput", "props": { "label": "Term (years)", "value": 30 }, "bind": { "value": "termYears" } },
       { "id": "mo", "type": "Metric", "props": { "label": "Monthly Payment", "unit": "USD" }, "bind": { "value": "loan.monthlyPayment" } },
       { "id": "tot", "type": "Metric", "props": { "label": "Total Paid", "unit": "USD" }, "bind": { "value": "loan.totalPaid" } }
     ]
   }
Always set specVersion to "0.1" and provenance.driver to "live", and provide a meaningful, accessible "fallbackText" summarizing the interface for non-visual surfaces.`
}
