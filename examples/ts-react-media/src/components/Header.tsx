import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useByok } from '@tanstack/ai-react'
import { ByokKeyDialog } from '@/components/ByokKeyDialog'
import { byok, getEnvKeyStatus } from '@/lib/byok'

const navLinkClass =
  'px-3 py-1.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors'
const navLinkActiveClass = 'bg-gray-700 text-white'

export default function Header() {
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({})
  const snapshot = useByok(byok)

  useEffect(() => {
    void byok.ready()
  }, [])

  useEffect(() => {
    void getEnvKeyStatus().then(setEnvStatus)
  }, [])

  useEffect(() => {
    if (snapshot.prompt) setKeyDialogOpen(true)
  }, [snapshot.prompt])

  return (
    <header className="p-4 flex items-center bg-gray-800 text-white shadow-lg">
      <h1 className="text-xl font-semibold">
        <Link to="/" className="flex items-center gap-3">
          <span className="text-2xl">🎨</span>
          <span>TanStack AI Visual</span>
        </Link>
      </h1>
      <span className="ml-4 text-sm text-gray-400">
        Image & Video Generation
      </span>
      <nav className="ml-auto flex items-center gap-2">
        <Link
          to="/"
          className={navLinkClass}
          activeProps={{ className: `${navLinkClass} ${navLinkActiveClass}` }}
          activeOptions={{ exact: true }}
        >
          Generators
        </Link>
        <ByokKeyDialog
          open={keyDialogOpen}
          onOpenChange={setKeyDialogOpen}
          envStatus={envStatus}
        />
      </nav>
    </header>
  )
}
