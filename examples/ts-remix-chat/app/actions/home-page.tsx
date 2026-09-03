import { Chat } from '../ui/chat.tsx'
import { Document } from './document.tsx'

export function HomePage() {
  return () => (
    <Document title="TanStack Remix Chat">
      <Chat />
    </Document>
  )
}
