---
'@tanstack/ai-sandbox-docker': patch
---

`resume()` of `dockerSandbox()` gives `null` only for a container that Docker does not have. Any other error, such as Docker not running, now goes to the caller, so a user sees "Docker is not running" and not "the workspace is gone".
