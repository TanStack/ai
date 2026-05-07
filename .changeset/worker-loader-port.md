---
'@tanstack/ai-isolate-cloudflare': minor
---

Port the Cloudflare worker driver from `unsafe_eval` to `worker_loader` (Dynamic Workers).

Cloudflare gates the `unsafe_eval` binding for all customer prod accounts; the previous driver was unusable in production and broken in `wrangler dev` on current Wrangler 4.x. The supported replacement is the `worker_loader` binding (GA-beta'd 2026-03-24).

**Breaking:** the worker now requires the `LOADER` binding instead of `UNSAFE_EVAL`. Update your `wrangler.toml`:

```toml
# before
[[unsafe.bindings]]
name = "UNSAFE_EVAL"
type = "unsafe_eval"

# after
[[worker_loaders]]
binding = "LOADER"
```

The HTTP tool-callback protocol and public driver API are unchanged. Workers Paid plan is required for any edge usage (deploy or `wrangler dev --remote`); local `wrangler dev` works on the Free plan.

Closes #522.
