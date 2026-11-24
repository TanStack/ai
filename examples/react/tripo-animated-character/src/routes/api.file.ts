import { createFileRoute } from '@tanstack/react-router'

// Tripo serves its files with no CORS header, so the browser cannot load them.
// This route fetches the file on the server and sends it to the page. It takes
// only Tripo file links, so it cannot fetch other sites.
const TRIPO_FILE_HOST = 'openapi-dl.data.tripo3d.com'

export async function GET({ request }: { request: Request }) {
  const link = new URL(request.url).searchParams.get('url')
  const fileUrl = URL.canParse(link ?? '') ? new URL(link ?? '') : null
  const isTripoFile =
    fileUrl?.protocol === 'https:' && fileUrl.hostname === TRIPO_FILE_HOST
  if (!fileUrl || !isTripoFile) {
    return new Response('The url must be a Tripo file link.', { status: 400 })
  }

  const file = await fetch(fileUrl, { signal: request.signal })
  if (!file.ok || !file.body) {
    return new Response('Tripo did not send the file.', { status: 502 })
  }
  return new Response(file.body, {
    headers: { 'content-type': 'model/gltf-binary' },
  })
}

export const Route = createFileRoute('/api/file')({
  server: {
    handlers: {
      GET,
    },
  },
})
