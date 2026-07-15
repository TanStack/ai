---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
---

Add definePlugin (server) and usePlugin/createPlugin (client): declare app-defined plugins — chatPlugin for conversational surfaces, generationPlugin for one-shot work with schema-validated inputs, plus media factories (imagePlugin, videoPlugin, etc.) — behind one endpoint and drive them from one fully typed client hook. Server-side composition is coming via a future workflowPlugin.
