// Sign in with ChatGPT redirects only to http://127.0.0.1:<port>/auth/callback.
// Vite listens on localhost ([::1]), so nothing answers on 127.0.0.1. This
// sends 127.0.0.1:3000 requests to the same path on localhost:3000, where
// completeChatGptSignIn finishes the sign-in.
import { createServer } from 'node:http'

const PORT = 3000

createServer((req, res) => {
  // Only redirect requests addressed to 127.0.0.1, so a localhost request
  // that lands here cannot loop.
  if (!req.headers.host?.startsWith('127.0.0.1')) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(302, { Location: `http://localhost:${PORT}${req.url ?? '/'}` })
  res.end()
})
  .on('error', (error) => {
    console.warn(
      `[chatgpt-callback] 127.0.0.1:${PORT} unavailable: ${error.message}`,
    )
    // ponytail: stay alive so `concurrently -k` does not stop the dev server.
    setInterval(() => {}, 1 << 30)
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(
      `[chatgpt-callback] http://127.0.0.1:${PORT} → localhost:${PORT}`,
    )
  })
