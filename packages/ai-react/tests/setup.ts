// jsdom does not implement Blob.prototype.arrayBuffer — polyfill it so that
// tests exercising AudioRecorder (which calls blob.arrayBuffer()) work in the
// jsdom environment without switching the whole suite to a Node environment.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}
