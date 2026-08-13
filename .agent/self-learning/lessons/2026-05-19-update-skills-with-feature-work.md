---
name: update-skills-with-feature-work
description: Use when implementing a feature in tanstack/ai that touches a surface covered by an agent skill — the skill needs to be updated in the same PR
tags: [agent-skills, documentation, monorepo, pr-discipline]
scope: repo
source:
  type: user-correction
  created: 2026-05-19T11:50:00Z
related_skill: null
related: [update-docs-with-new-cases]
---

# Agent Skills Need to Be Updated With the Feature Work That Touches Them

**Rule:** When implementing a feature that changes or extends a surface covered by an agent skill under `packages/ai/skills/**` or `packages/ai-code-mode/skills/**`, update the skill in the same PR. Don't treat skill updates as a follow-up — they ship to coding agents that read them as authoritative.

**Why:** The user pointed this out after I'd already landed code, docs, e2e tests, and the example UI for the multi-turn structured-output PR (#577) without touching `ai-core/structured-outputs/SKILL.md`. The skill was still documenting the old single-slot `partial` / `final` design and still telling agents to filter `TextPart`s out of `useChat` renderers — the exact hack the PR removes. Without the skill update, every coding agent reading that skill would continue generating the obsolete pattern. Skills are a contract with downstream agents the same way the public API is a contract with users.

**How to apply:**

1. **Before shipping any non-trivial feature**, grep `packages/ai*/skills/**/SKILL.md` for the symbols, types, hooks, or patterns the feature touches. If any skill mentions them, that skill needs review.
2. **Check both directions:** does the skill teach something the feature now makes wrong? Does the feature introduce a pattern the skill should add? Both warrant edits.
3. **Update in the same PR as the feature code.** Splitting into a follow-up means the skill is stale during the window between merges — and during that window, agents reading the skill generate broken code that targets a surface that no longer exists.
4. **After updating, fact-check the skill the same way as the docs** — dispatch a verification pass against the current source code. Hallucinations in skills propagate further than hallucinations in docs because agents act on them autonomously.
5. **Don't forget the description / sources frontmatter** — `sources:` paths break silently when docs get reorganized (e.g. when `chat/structured-outputs.md` becomes a redirect stub and the real content moves to `structured-outputs/*`).

**Heuristic for "is this feature skill-relevant":** if the feature adds a new public API, changes the shape of a public type, deprecates a pattern, or introduces a new way of consuming an existing surface, the answer is yes. Pure refactors and internal-only changes can usually skip it.
