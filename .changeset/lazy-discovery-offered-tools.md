---
'@tanstack/ai': patch
---

The lazy tool discovery tool no longer says `Unknown tool` for a tool that the model can already call. Before, it knew only the lazy tools. When a model asked it for an eager tool, or for a tool that a middleware added, it returned `Unknown tool`, and some models then stopped using that tool. Discovery now returns the definition of each tool offered to the model in that step. An eager tool that a middleware removed still gets `Unknown tool`.
