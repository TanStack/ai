---
'@tanstack/ai-client': patch
---

Fix passkey BYOK silently hanging on unlock. Browsers that gate WebAuthn on transient user activation (Dia, Safari) suppress `navigator.credentials.get()` with no prompt when it runs outside a user gesture — so an unlock buried in an async send pipeline never resolves. `passkeyStorage` now fails fast with a clear, catchable error instead of hanging. Trigger unlock (`byok.prepare()` / `byok.unlock()`) directly from the user's click handler.
