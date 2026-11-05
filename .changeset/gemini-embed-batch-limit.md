---
'@tanstack/ai-gemini': patch
---

`embed()` with the Gemini adapter now sends inputs in requests of at most 100 texts, one after the other, instead of one request for the whole array. Vectors keep input order and indexes, and Vertex billable characters are summed across requests. Calls with 100 or fewer inputs are unchanged.
