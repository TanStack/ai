---
'@tanstack/ai-harness': patch
---

Make the transport defaults safe for a server with many instances.

- `createHarnessHandler` and `handleHarnessSocket` need `canAccess`. To let every principal use every thread, pass `canAccess: () => true`.
- On a durable host (`stores.log`), `createHarnessHandler` throws without `mediaSecret`, so a media URL that one instance signs works on every instance.
- `oauthConnector` needs `login`. Use `'device'` on a server, and `'loopback'` only for a harness on the user's own machine, such as a CLI.
