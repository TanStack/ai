---
'@tanstack/ai-harness': minor
---

Routed agents now remember their own tool calls, you can pass your own handoff tool, and a `harnessAgent` can be a root agent.

- `routing.history` sets what each model call gets of the routed runs of earlier turns. With `'own'` (the default), a routed agent gets its own earlier runs in full, with tool calls and results. It gets the other agents and the main model as labeled text in a user message, for example `main:\n...`. The main model gets the routed answers the same way, so no model reads the words of another speaker as its own. `'all'` gives every speaker every routed run in full. `'text'` gives routed runs as text only, as before.
- `routing.handoffTool` makes the handoff tool of each speaker. It gets `from`, `targets`, `allowHuman`, and `handoff`. The tool can have any name and its own fields.
- A `harnessAgent` in `agents` with `routing` keeps one child session across turns. Each turn sends it what happened in the thread since its last turn. Its model gets the `handoff` tool, so it can hand back.

The default `history: 'own'` changes the messages that routed agents and handoff targets get. A target gets the turns of the main model as labeled text. To keep the earlier messages, and the prompt cache of the provider for a handoff target, set `routing: { router, history: 'text' }`.

An app tool with the name of the handoff tool now replaces the harness tool. Before, the turn failed with a duplicate tool error.

A handoff from the `handoff` tool of a root agent now adds the note messages to the thread, as a router or code handoff does. Before, the next speaker did not see that the agent handed off. On models that reject a context that ends on an assistant message (new Claude models), the main model failed after a hand-back.
