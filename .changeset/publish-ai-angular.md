---
'@tanstack/ai-angular': patch
---

Publish a working `@tanstack/ai-angular` build. The only version previously on npm (`0.0.1`) was seeded with a manual `npm publish` and shipped unresolved `workspace:` specifiers in its `dependencies`/`peerDependencies`, making it uninstallable (`EUNSUPPORTEDPROTOCOL`). Releasing through the changesets pipeline rewrites those specifiers to concrete versions.
