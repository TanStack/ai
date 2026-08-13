// jsdom does not implement Blob.prototype.arrayBuffer, which AudioRecorder's
// finalize() path relies on. Polyfill it (a no-op when the runtime already has
// it, e.g. Node) so the framework hook tests can run under jsdom without
// switching the whole suite to a Node environment. Registered once per package
// via Vitest `setupFiles`.
//
// The `Partial<Blob>` view types `arrayBuffer` as optional so the feature check
// isn't flagged "always falsy" — lib.dom declares it as always present.
if (typeof Blob !== 'undefined') {
  const blobProto = Blob.prototype as Partial<Blob>
  if (typeof blobProto.arrayBuffer !== 'function') {
    blobProto.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(this)
      })
    }
  }
}

// Side-effect-only module.
export {}
