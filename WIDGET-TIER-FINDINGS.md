# Escape-Hatch Widget Tier — Findings from a Running Prototype

**Status:** research prototype, built and browser-verified 2026-10-15. Proposes
spec §6.5 (`Widget`) + a bridge API, and realizes the reserved §15.3 code tier.
Everything below is grounded in code that ran, not design intent.

## 0. Why

Google Antigravity's generative UI renders arbitrary bespoke widgets by writing
a self-contained `.html` artifact and mounting it in a sandboxed `<iframe>`
(strict CSP, one allow-listed CDN, host theme CSS variables injected on `:root`).
That buys **expressiveness** — any custom SVG/canvas/interaction — at the cost of
the three things Open Generative UI is built on:

- **determinism** — the model authors the arithmetic in JS;
- **portability** — HTML is not a node graph; it can't degrade to a CLI/text surface;
- **testability** — you cannot exercise it without a model.

The question this prototype answers: *can we match that expressiveness without
giving those up?* The answer is yes, under one principle.

## 1. Principle — sandbox the rendering, not the truth

A custom widget may **draw anything**, but:

- numbers it presents as computed come from **`host.compute()`** (the registry) —
  the widget cannot author arithmetic;
- **state lives host-side** (§5.3) — the widget reads/writes it over the bridge;
- actions leave only as **structured intents** (§8), through the host's permission
  rules;
- the widget has **no network** and no generic host access.

The rendering is sandboxed; the truth stays host-side.

## 2. The `Widget` node (proposed §6.5)

A leaf catalog node:

```jsonc
{ "id": "w", "type": "Widget",
  "props": { "srcdoc": "<!doctype html>…", "height": 360, "title": "Savings growth" } }
```

- `srcdoc` — a self-contained HTML document (prototype). In production this is a
  **registered, versioned module** reference (a constructor, §7.4), not inline
  model output — see §6.
- `height`, `title` — presentation.
- Added to `KNOWN_CATALOG_TYPES`; unknown-type repair (§9.3) leaves it intact,
  and it still carries graph-level `fallbackText` for degradation (§9.2).

## 3. The bridge (proposed normative API) — exactly what ran

The host mounts `<iframe sandbox="allow-scripts">` (no `allow-same-origin` → the
frame has an **opaque origin**; it cannot touch host DOM, cookies, or storage).
The only channel is `postMessage`. Messages that ran in the prototype:

| Direction | Message | Meaning |
|---|---|---|
| widget → host | `{type:'gui:ready'}` | widget mounted; request theme + state |
| host → widget | `{type:'gui:theme', tokens}` | the `--gui-*` tokens, read from host `getComputedStyle` |
| host → widget | `{type:'gui:state', state}` | current local-state snapshot (on ready + on change) |
| widget → host | `{type:'gui:compute', id, name, inputs}` | run a registry function |
| host → widget | `{type:'gui:compute:result', id, result}` | the host-computed value |
| widget → host | `{type:'gui:getState', id, path}` / `gui:getState:result` | read host state |
| widget → host | `{type:'gui:setState', path, value}` | write host state |
| widget → host | `{type:'gui:intent', intent, payload, intentClass}` | structured intent (§8) |

Host-side guarantees in the implementation:
- `event.source === iframe.contentWindow` — only this widget's frame is trusted.
- `targetOrigin: '*'` on host→widget posts is correct here (the frame's origin is
  opaque, so no specific origin can be named) and safe because the host controls
  the `srcdoc` and `sandbox` blocks top-navigation/popups.
- Compute runs against the host registry and the **latest** host state (kept in a
  ref), so the number is authoritative regardless of what the widget draws.

## 4. Security posture — and a real gap we closed

**`sandbox="allow-scripts"` alone does NOT block the network.** The frame has an
opaque origin but can still `fetch()`/beacon out. This is the gap Antigravity
closes with CSP, and the prototype initially missed it.

Fix (now in the renderer): the host **injects a CSP** into the widget document:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;
```

`connect-src` falls through to `default-src 'none'` → **no network**. Inline
script/style keep a self-contained widget working. **Verified**: with the CSP
active, the widget still renders, still computes (postMessage is unaffected), and
has no path to phone home. The only way out is the bridge the host owns.

Production hardening beyond the prototype: serve/enforce CSP via headers too (not
only a `<meta>`), and treat live/ephemeral widget code as `untrusted` (§7.4.1).

## 5. Theme injection (§9.5) — convergent with Antigravity

The host reads its own computed `--gui-*` tokens and posts them to the frame,
which applies them to `:root`; the widget styles against them
(`background: var(--gui-surface)`, `color: var(--gui-text)`, accent/positive,
etc.). This is the same mechanism Antigravity uses, and the same tokens the
inline renderer already uses (so a widget blends into the host surface, light or
dark, with no per-widget theming). Confirmed visually: the widget's card/curve/
value matched the host palette.

## 6. Delivery & trust — constructors first (§7.4), live last

The prototype uses inline `srcdoc` for convenience. The intended production path:

- **Constructor-backed (trusted):** a human/agent authors the widget once in code
  mode; it is reviewed, versioned, trust-tiered, and registered. The live model
  only *invokes* it with params. Deterministic per param set → fixture-testable
  (§7.1).
- **Live ephemeral (untrusted):** the model emits a self-contained widget inline
  (the direct Antigravity analog), rendered through the **same** sandbox + CSP +
  bridge, gated by host policy, always shipping `fallbackText`.

Trust tiers (§7.4.1) decide what runs unattended.

## 7. What the prototype proved (evidence)

Scenario `savings-widget` (fixture, no model), browser-driven:

- **Bespoke rendering** a catalog can't express: a hand-drawn compound-growth
  curve in inline SVG, redrawn live from a slider.
- **Determinism preserved**: the headline "projected value" is `host.compute(
  'savingsGrowth', …)` — **$376,243** at $300/mo, recomputing to **$1,296,558**
  at $1,050/mo. The widget never does the headline math.
- **Structured intent**: "Save this plan" emitted `savePlan` (ACTION) with payload
  `{monthlyContribution: 1050, projected: "$1,296,558"}`, logged by the host's
  outbound intent panel (§8).
- **Theme-native** and **network-blocked** (CSP), as above.

Expressiveness parity with the iframe approach, with determinism, host-owned
state, structured intents, theming, and a text fallback all intact.

## 8. Limitations observed / open questions

- **Internal widget JS is still untestable without a browser** — same ceiling as
  Antigravity. Mitigation: keep the widget *thin* (drawing only) and push logic to
  `host.compute`; test the compute functions and the fixture snapshot, not the JS.
- **State sync is a full snapshot** in the prototype; a real bridge should send
  state **patches** and debounce.
- **No `module` registry yet** — only inline `srcdoc`. The constructor registry
  (§7.4) + trust tiers are the next build.
- **CSP must also be enforced at the header level** for hosts that can; the
  `<meta>` injection is necessary but a belt-and-suspenders header is better.
- **WASM variant (§15.3)** — the same bridge contract could back a WASM widget
  (no DOM, emits catalog graph ops) for an even stronger isolation story; the
  iframe prototype validates the contract first.

## 9. Recommended spec edits

1. Add **§6.5 `Widget`** (escape hatch) as a first-class, optional catalog node.
2. Adopt the **bridge API** in §3 as normative (compute / state / intent only;
   no network).
3. Require, for any live/untrusted widget: **sandbox + CSP `default-src 'none'`**,
   a **`fallbackText`**, and **`untrusted` trust tier** until reviewed.
4. Make **constructors (§7.4)** the delivery mechanism; inline `srcdoc` is the
   dev/ephemeral path.
5. Keep **§15.3** open for the WASM variant, reusing this bridge contract.

The escape hatch is no longer "MCP Apps, out of scope" — it can be a native,
principled tier of this spec that matches the expressiveness we were missing
without surrendering what makes us different.
