---
'@tanstack/ai-generative-ui': minor
---

Live data sources for Tier F iframe artifacts.

A model can bind an artifact to a host-registered streaming data source via
`create_artifact`'s new `dataSource: { name, params }` field; the host subscribes
on mount and pushes each value into the sandboxed frame, where `useHostData()`
re-renders in place — real-time updates without regenerating the artifact.

- New `DataSourceRegistry` + `describeDataSourcesForPrompt` (`@tanstack/ai-generative-ui`),
  the streaming sibling of `ComputeRegistry`: the host registers named
  `subscribe(params, emit) => unsubscribe` sources, surfaced to the model in the
  system prompt the same way compute functions are.
- The binding persists on `ArtifactRecord.dataSource` (threaded through create and
  revise) and is emitted on the `genui:artifact` pin event.
- `FrameArtifactRenderer` gains a `subscribeData` prop: subscribe on mount, push
  each emission over the active bridge, unsubscribe on unmount; it also re-pushes
  the static `data` prop when it changes (previously a one-shot snapshot).
- Live push uses the built-in `ogui/1` bridge (`host.data` → `useHostData`), which
  delivers reliably into a sandboxed opaque-origin iframe. The MCP Apps standards
  path still renders static artifacts.

Live values stay host-authoritative, like `data` — the model renders what arrives,
it does not compute it.
