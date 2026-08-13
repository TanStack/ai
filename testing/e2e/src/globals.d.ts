// Vite query-suffix imports (e.g. `import css from './styles.css?url'`)
// return the asset URL as a string. TS doesn't know about this without a
// module declaration shim.
declare module '*.css?url' {
  const url: string
  export default url
}
