<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-generative-ui

Reference implementation of the **Open Generative UI Specification (Draft 0.1)** for TanStack AI.

Generative UI is the missing layer in agent interfaces: the agent composes an interface appropriate to the task, from a shared vocabulary of components the host knows how to render.

## Core Capabilities

1. **Portable & Safe**: Clean-room JSON node graph model without arbitrary HTML/JS execution from language models.
2. **Deterministic Computation**: Numbers and aggregates presented by the UI are computed by registered host code (`billSplit`, `savingsGrowth`, etc.), not hallucinatory arithmetic by language models.
3. **Structured Intents**: Bidirectional interaction flows back to the host/agent as structured intents (`local`, `submit`, `action`).
4. **Resilient Degradation**: Unknown components degrade to their children or accessible fallback text; invalid props are clamped to valid ranges.
5. **Declarative Vector Scenes**: `Scene` shape graphs for data-driven diagrams (chord diagrams, topology, workflows) with declared semantic paint roles and interaction.
6. **Fixture & Driver Architecture**: Testable without a model via 9 canonical fixtures covering all 8 use-case jobs plus vector scenes.
