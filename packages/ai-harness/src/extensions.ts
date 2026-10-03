/**
 * A list one plugin reads and other plugins add to, in any order. For
 * example, a permissions plugin reads rules that tool plugins contribute.
 *
 * @example
 * ```ts
 * export const PermissionRules = createExtensionPoint<PermissionRule>('acme/permission-rules')
 * // a tool plugin: contribute: [PermissionRules.item({ tool: 'write_file', decision: 'ask' })]
 * // the permissions plugin, at run time: ctx.collect(PermissionRules)
 * ```
 */
export interface ExtensionPoint<T> {
  readonly name: string
  item: (value: T) => ExtensionItem<T>
}

/** One contribution to an extension point. */
export interface ExtensionItem<T = unknown> {
  readonly point: string
  readonly value: T
}

export function createExtensionPoint<T>(name: string): ExtensionPoint<T> {
  return { name, item: (value) => ({ point: name, value }) }
}

/**
 * A typed plugin event. `ctx.emit(event, value)` sends it to every
 * `ctx.on(event, handler)` in the session, and clients see it as a
 * `harness.plugin.event` CUSTOM event.
 */
export interface PluginEvent<T> {
  readonly name: string
  /** Type only. Never read at runtime. */
  readonly __type?: T
}

export function createPluginEvent<T>(name: string): PluginEvent<T> {
  return { name }
}
