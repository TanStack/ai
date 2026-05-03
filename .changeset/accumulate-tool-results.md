---
"@tanstack/ai-isolate-cloudflare": patch
---

fix(ai-isolate-cloudflare): accumulate `toolResults` across rounds in the driver round-trip

The Cloudflare isolate driver was wiping `toolResults` between rounds. `wrap-code` uses sequential `tc_<idx>` ids that are re-derived every round when the Worker re-executes user code, so prior-round results must remain in the cache. With the wipe, multi-tool programs (e.g. `await A(); await B();`) would ping-pong between `{tc_0}` and `{tc_1}` and exhaust `maxToolRounds`, surfacing as `MaxRoundsExceeded`.

Single-tool code worked because only one cache entry was ever needed in a given round. Existing tests covered single-round flows only and did not exercise real `wrap-code` ids end-to-end, so the regression slipped through.

Added a `tc_<idx>`-shaped regression test that fails on the prior implementation and passes with the merge.
