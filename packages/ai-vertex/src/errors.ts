export class VertexAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VertexAuthError'
  }
}
