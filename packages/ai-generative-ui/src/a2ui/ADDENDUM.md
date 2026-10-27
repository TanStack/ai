# A2UI as a parallel mechanism — addendum to Open Generative UI Draft 0.1

**Status: shipped (flagged), 2026-10-27.** Decision pass complete; the spike's
Q1 is answered by result — **keep the independent graph format, ship an inbound
converter**, and treat A2UI alignment as a maintained mapping table, not an
aspiration. Landed as stacked commits on the `generative-ui` branch behind the
`a2uiBinding` / `VITE_A2UI_BINDING` flag (default off). The parent spec's §11
bullet ("alignment target" → "inbound converter shipped, flagged") and §12 Q1
closure live in the external spec document, not this repo.

This records the design **as implemented in `src/a2ui/`**. Where the shipped
host catalog differed from the Draft 0.1 §6 sketches the spike was written
from, the mapping table below reflects the shipped prop names, not the sketch.

---

## A1. Where A2UI enters the architecture (§4)

Draft 0.1 defines four layers: Driver (§7) → node graph (§5) → transport binding
(§4.1) → host renderer (§9). A2UI touches only the middle two:

- **New transport binding (§4.1):** *A2UI operations.* A stream of A2UI v0.9
  operations (`createSurface`, `updateComponents`, `updateDataModel`,
  `deleteSurface`), carried over AG-UI or as a tool-result container
  (`{ "a2ui_operations": [...] }`). A host claims this binding independently.
- **New driver class (§7):** an *A2UI adapter driver* (`A2uiSurfaceStore`). Not
  a `UIDriver` — it does not answer a `UIRequest` with a graph. It is a stateful
  translator: it consumes operations and maintains one graph document per
  `surfaceId`, emitting a new revision whenever the surface's component set or
  data model changes. Downstream, a surface is indistinguishable from any other
  graph: same validation and bounded repair (§9.3), same renderer (§9), same
  intent machinery (§8).

The catalog (§6) is **not** extended to match A2UI, the graph format (§5) is
**not** revised toward A2UI, and no CopilotKit code is imported — the adapter is
implemented from the A2UI specification (Apache 2.0), preserving §0's clean-room
posture.

## A2. The translator

### A2.1 Surface state

Per `surfaceId` the adapter keeps `catalogId`, a flat `id → component` map
(merged by `updateComponents`), a `dataModel` JSON value (patched by
`updateDataModel` at a JSON Pointer), a `revision` (increments per applied op
batch), and a `rootId` (`createSurface.root`, else the unreferenced component;
multiple orphans wrap in a synthetic `Stack`). Unknown-`surfaceId` ops are
buffered per surface and flushed on creation, up to a bounded buffer.

### A2.2 Operation shape discipline

v0.9 operations are **nested** (`{ "createSurface": {...} }`). The flat legacy
shape (`{ "type": "create_surface", ... }`) is **ignored with a diagnostic** —
the strictness of the spec, without its silence. A future version's operations
are diagnostic-and-dropped rather than best-effort parsed. Every translation
problem is a machine-readable diagnostic, part of the adapter's public API.

### A2.3 Flat list to tree

Children are referenced by id (`children`, singular `child`, or `tabItems`). The
translator builds the §5.2 tree from the root with a cycle guard (a revisited id
degrades to a `Text` placeholder + diagnostic — a graph never fails wholesale).

### A2.4 Bindings

Props may be literals or `{ "path": "/ptr" }` bindings into the data model.
Content props are resolved **eagerly** at graph-build time, so a later
`updateDataModel` produces a new revision — exactly the patch-by-revision model
§10 reserved. **Input values** are the exception: a bound `value` becomes an
OGUI state binding (`bind.value`, pointer joined with `.`), preserving two-way
editing (§5.3). Unresolvable paths → the prop is omitted with a diagnostic; a
raw `{ path }` object is **never** leaked into a prop.

### A2.5 What the translator synthesises

A2UI has no equivalent of two §5.1 requirements, so the adapter synthesises and
marks them:

- **`fallbackText`:** depth-first concatenation of resolved Text content (and
  Button labels), tree order.
- **`title` (required §5.1):** the first heading, else the first text line, else
  `A2UI surface <id>`. Always present, so the graph needs no validator repair.
- **`provenance`:** `{ driver: "a2ui", sourceId: <surfaceId>, context: {
  catalogId } }`. This required extending `GraphProvenance` with the `a2ui`
  driver and a `context` field (types, JSON schema, and the validator's bounded
  repair, which now preserves both instead of repairing the driver to `"live"`).

**`graphId`:** `a2ui:<surfaceId>`, stable across revisions.

## A3. Catalog mapping (as shipped)

Data-driven (`catalog-map.ts`), extended/overridden per catalogId via
`TranslatorOptions.mappings` — a host's BYOC components map through the same
table. Unmapped components degrade per §9.3: with children → `Stack`; without →
`Text` carrying the first resolved string; always with a diagnostic.

Prop names target the **shipped host renderer**, which is where the spec-sketch
spike drifted:

| A2UI | OGUI | Shipped mapping notes |
|---|---|---|
| `Column` | `Stack` | vertical sequence |
| `Row` | `Columns` | `count` = clamp(children, 2..4); >4 children chunk into a `Stack` of `Columns` |
| `Card` | `Section` | child preserved |
| `List` | `List` | **host `List` is a leaf keyed on `items`** — text children flatten to `items[]`; non-text children degrade the List to a `Stack` (diagnostic) |
| `Tabs` | `Tabs` | **`tabs: [{ id, label }]`** from `tabItems`; each panel child tagged `props.tabId` (the renderer filters on it) |
| `Text` | `Text` | **prop is `content`** (not `text`); `usageHint` h1–h5 → `heading`, caption → `caption`, else `body` |
| `Image` | `Image` | **prop is `src`**; A2UI carries no alt — synthesised empty + diagnostic (host closes §9.4) |
| `Button` | `Button` | label from child Text; `variant` → `tone` (clamped to the host enum); `action` → `on.click` **object form** `{ intent, payload }` so context reaches §8 |
| `TextField` | `TextInput` / `NumberInput` | by `textFieldType`; `value` binding → `bind.value`; `validationRegexp` → `validation.pattern` |
| `CheckBox` | `Checkbox` | label |
| `ChoicePicker` | `Select` | options; host `Select` is single-select — `multipleSelection` emits a diagnostic |
| `Slider` | `Slider` | `minValue`/`maxValue` → `min`/`max` |
| `DateTimeInput` | `TextInput` | §6 defers date pickers; diagnostic |
| `Divider`, `Icon` | — (dropped) | no catalog equivalent; diagnostic |
| `Modal` | `Section` | flattened inline; diagnostic |

Custom-catalog (CopilotKit BYOC) widgets ship in the profile as the worked
example of the override hook: `DataTable` → `Table`, `Metric` → `Metric`
(A2UI `trend` → the host's signed `delta`), `PieChart`/`BarChart` → `Chart`
(**flat `data: [{ label, value }]`** — no series transform), `StatusBadge`/
`InfoRow` → `Text`.

**Deliberately not mapped:** anything compute-bound. A2UI has no compute
registry (§5.3); a translated graph contains no compute bindings, and a native
graph with compute bindings **cannot be exported to A2UI losslessly**.

## A4. Actions back (§8)

A2UI `action: { event: { name, context } }` → the node's `on.click`. The
adapter's `classifyA2uiAction` *suggests* a class: **Submit** by default,
**Action** for world-changing verbs (`book`, `pay`, `delete`, …) so hosts route
them through approval. *Suggested* — §8 keeps the approval model with the host;
the helper never downgrades. **Local** never applies: an A2UI event always
leaves the renderer.

## A5. Conformance and tests

Fixture-tested, no live model: (1) flight card — bindings resolved, zero leaked
`{ path }`, validates with no repairs; (2) progressive dashboard — a new
revision per data patch; (3) shape discipline; (4) degradation; (5) lifecycle /
buffering; (6) intent classification; (7) **dual-encoding** — the spend
dashboard authored natively *and* as A2UI ops renders through the same renderer
and produces structurally-equal trees modulo synthesised fields. (7) is the test
that makes "parallel mechanism" a claim instead of a slogan.

## A6. What this does not do

- No outbound (OGUI → A2UI) export — compute and `Scene` make it lossy.
- No A2UI *generation*: no `generate_a2ui` tool, no dynamic-schema sub-agent.
  Agents that already speak A2UI can be rendered; our drivers keep our format.
- No persistence: surfaces stay ephemeral, as A2UI intends. A translated graph
  can still be pinned in the artifact store, at which point it is a graph with
  A2UI provenance.

## A7. Landing plan (as landed)

Stacked commits on `generative-ui`, flag `a2uiBinding` default-off:

1. `feat(ai-generative-ui): A2UI v0.9 operation types + container parser` —
   types, nested/flat discipline, container extraction, JSON Pointer helpers,
   and the `GraphProvenance` extension (driver + context).
2. `feat(ai-generative-ui): A2UI surface store + translator` — state, tree
   building, binding resolution, synthesis, diagnostics, basic catalog.
3. `feat(ai-generative-ui): A2UI catalog mapping — BYOC + host override hook`.
4. `feat(ai-generative-ui): A2UI action classification`.
5. `feat(hosts): wire A2UI detection beside render_ui + dual-encoding proof` —
   the TanStack chat surface gains the flag-gated second trigger; §A5.7 proof.

Commits 1–4 are host-independent. Commit 5 is the only demo-adjacent step and
is inert with the flag off. Goose host wiring is external and can trail.
