/**
 * Attach a WebRTC stream the way ReactorView does: mute for autoplay, then
 * re-attach when a track unmutes. Remote tracks often arrive muted; Chrome
 * keeps the <video> black until srcObject is set again after unmute.
 */
export function attachStream(
  video: HTMLVideoElement,
  stream: MediaStream,
  onError?: (error: unknown) => void,
): () => void {
  const attach = (reset: boolean) => {
    if (reset) {
      video.srcObject = null
    }
    video.srcObject = stream
    void video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      onError?.(error)
    })
  }
  attach(false)
  const onUnmute = () => attach(true)
  const tracks = stream.getTracks()
  for (const track of tracks) {
    track.addEventListener('unmute', onUnmute)
  }
  return () => {
    for (const track of tracks) {
      track.removeEventListener('unmute', onUnmute)
    }
  }
}
