---
'@tanstack/ai-harness': patch
---

Fix TS2615 under TypeScript 7.1: "Type of property 'agents' circularly references itself in mapped type 'Pick<SessionImpl<…>, PublicSessionMember>'". `defineHarness()` and `host.open()` failed with it in code that TypeScript 7.0 accepts. `HarnessAgentsOf` now reads the `agents` and `subagents.agents` of a harness instead of matching the whole definition, which reached `session.agents` again. The types it gives are unchanged.
