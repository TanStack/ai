---
'@tanstack/ai-cohere': patch
---

`embed()` with the Cohere adapter no longer fails with a 400 when given more than 96 inputs. The adapter now splits the input into requests of at most 96 (the `v2/embed` per-request limit) and returns the vectors in input order, with token usage summed across requests.
