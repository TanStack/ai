/**
 * Async Request Registry
 *
 * A singleton registry that manages pending async requests between the server-side
 * VM tool handlers and client-side operations. This enables the isolated VM to
 * call client-side operations (like file picker, mic recording) and wait for results.
 *
 * Flow:
 * 1. Server tool handler creates a request with a unique ID
 * 2. Tool emits custom event to client via SSE with the request ID
 * 3. Client performs the operation (e.g., file upload, mic recording)
 * 4. Client POSTs result to /api/audio-resolve with the request ID
 * 5. Registry resolves the promise, VM continues with the data
 */

export interface PendingRequest<T = unknown> {
  resolve: (data: T) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
  createdAt: number
  requestType: string
}

/**
 * Generate a unique request ID
 * Format: req-{timestamp}-{random}
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Singleton registry for managing async requests
 */
class AsyncRequestRegistryImpl {
  private pending = new Map<string, PendingRequest>()
  private static instance: AsyncRequestRegistryImpl | null = null

  private constructor() {
    // Private constructor for singleton
    console.log('[AsyncRegistry] Initialized')
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): AsyncRequestRegistryImpl {
    if (!AsyncRequestRegistryImpl.instance) {
      AsyncRequestRegistryImpl.instance = new AsyncRequestRegistryImpl()
    }
    return AsyncRequestRegistryImpl.instance
  }

  /**
   * Create a new pending request and return a promise that resolves when
   * the client responds via /api/audio-resolve
   *
   * @param requestId - Unique identifier for this request
   * @param timeoutMs - How long to wait before timing out (default 120s for user interactions)
   * @param requestType - Type of request for logging purposes
   */
  createRequest<T = unknown>(
    requestId: string,
    timeoutMs: number = 120000,
    requestType: string = 'unknown',
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Clear any existing request with this ID (shouldn't happen, but be safe)
      if (this.pending.has(requestId)) {
        console.warn(`[AsyncRegistry] Overwriting existing request: ${requestId}`)
        this.cancelRequest(requestId)
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        console.warn(`[AsyncRegistry] Request timed out after ${timeoutMs}ms: ${requestId}`)
        this.pending.delete(requestId)
        reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms. The user may have cancelled or the operation took too long.`))
      }, timeoutMs)

      // Store the pending request
      this.pending.set(requestId, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timeout,
        createdAt: Date.now(),
        requestType,
      })

      console.log(`[AsyncRegistry] Created request: ${requestId} (type: ${requestType}, timeout: ${timeoutMs}ms)`)
      console.log(`[AsyncRegistry] Pending requests: ${this.pending.size}`)
    })
  }

  /**
   * Resolve a pending request with data from the client
   *
   * @param requestId - The request ID to resolve
   * @param data - The data to resolve with
   * @returns true if request was found and resolved, false otherwise
   */
  resolveRequest(requestId: string, data: unknown): boolean {
    const request = this.pending.get(requestId)

    if (!request) {
      console.warn(`[AsyncRegistry] No pending request found for ID: ${requestId}`)
      console.log(`[AsyncRegistry] Current pending IDs: ${Array.from(this.pending.keys()).join(', ') || '(none)'}`)
      return false
    }

    // Clear timeout and remove from pending
    clearTimeout(request.timeout)
    this.pending.delete(requestId)

    const duration = Date.now() - request.createdAt
    console.log(`[AsyncRegistry] Resolved request: ${requestId} (type: ${request.requestType}, duration: ${duration}ms)`)

    // Resolve the promise
    request.resolve(data)
    return true
  }

  /**
   * Reject a pending request with an error
   *
   * @param requestId - The request ID to reject
   * @param errorMessage - Error message to reject with
   * @returns true if request was found and rejected, false otherwise
   */
  rejectRequest(requestId: string, errorMessage: string): boolean {
    const request = this.pending.get(requestId)

    if (!request) {
      console.warn(`[AsyncRegistry] No pending request found for ID: ${requestId}`)
      return false
    }

    // Clear timeout and remove from pending
    clearTimeout(request.timeout)
    this.pending.delete(requestId)

    const duration = Date.now() - request.createdAt
    console.log(`[AsyncRegistry] Rejected request: ${requestId} (type: ${request.requestType}, duration: ${duration}ms, error: ${errorMessage})`)

    // Reject the promise
    request.reject(new Error(errorMessage))
    return true
  }

  /**
   * Cancel a pending request without resolving or rejecting
   * Used for cleanup when overwriting requests
   */
  cancelRequest(requestId: string): boolean {
    const request = this.pending.get(requestId)

    if (!request) {
      return false
    }

    clearTimeout(request.timeout)
    this.pending.delete(requestId)
    console.log(`[AsyncRegistry] Cancelled request: ${requestId}`)
    return true
  }

  /**
   * Check if a request is currently pending
   */
  hasPendingRequest(requestId: string): boolean {
    return this.pending.has(requestId)
  }

  /**
   * Get the count of pending requests (for debugging)
   */
  getPendingCount(): number {
    return this.pending.size
  }

  /**
   * Get info about all pending requests (for debugging)
   */
  getPendingInfo(): Array<{ id: string; type: string; age: number }> {
    const now = Date.now()
    return Array.from(this.pending.entries()).map(([id, req]) => ({
      id,
      type: req.requestType,
      age: now - req.createdAt,
    }))
  }
}

// Export the singleton instance
export const asyncRegistry = AsyncRequestRegistryImpl.getInstance()

// Also export the class for typing purposes
export type AsyncRequestRegistry = AsyncRequestRegistryImpl

