---
---

Remove the stale PHP and Python packages and their example apps. TanStack AI now focuses exclusively on TypeScript; AG-UI handles interop with non-JS servers, so first-party PHP/Python clients are no longer maintained.

Removed:

- `packages/php/tanstack-ai` (composer package `tanstack/ai`)
- `packages/python/tanstack-ai` (PyPI package `tanstack-ai`)
- `examples/php-slim`
- `examples/python-fastapi`

No published `@tanstack/*` npm packages are affected.
