---
'@tanstack/ai-dashboard': minor
---

The dashboard host recovers from a restart, and the page opens threads.

- **Pair again.** After a dashboard restart, a saved host token gets a `401`. With `onPairingCode`, the host pairs again and calls `onToken` with the new token. Without it, the new `onError` option gets the error. `connection.token` holds the current token.
- **`onError`** also gets an error when the host cannot handle a frame, for example when a thread cannot open. The connection stays.
- **Open a thread.** Each host row on the page has an "Open a thread" form. The host must set `allowRemoteStart`. A message sent right after the open waits for the thread, and a refused thread keeps its harness name in the sessions list.
