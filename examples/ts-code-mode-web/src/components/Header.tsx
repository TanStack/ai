import { Link } from '@tanstack/react-router'
import {
  Code2,
  Menu,
  FileJson,
  X,
  FileText,
  FileCode2,
  Landmark,
  ShoppingBag,
  Database,
  BarChart3,
} from 'lucide-react'
import { useState } from 'react'

interface HeaderProps {
  children?: React.ReactNode
}

export default function Header({ children }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <header className="px-4 py-3 flex items-center bg-gray-800 text-white shadow-lg">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <div className="ml-4 flex items-center gap-3">
          <Code2 size={28} className="text-cyan-400" />
          <h1 className="text-xl font-semibold">
            <Link to="/">TanStack AI Code Mode Demo</Link>
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">{children}</div>
      </header>

      <aside
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Navigation</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            to="/"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-amber-600 hover:bg-amber-700 transition-colors mb-2',
            }}
          >
            <ShoppingBag size={20} />
            <span className="font-medium">Product Demo</span>
          </Link>
          <Link
            to="/database-demo"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition-colors mb-2',
            }}
          >
            <Database size={20} />
            <span className="font-medium">Database Demo</span>
          </Link>
          <Link
            to="/npm-github-chat"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <FileCode2 size={20} />
            <span className="font-medium">NPM-GitHub Chat</span>
          </Link>
          <Link
            to="/reporting-agent"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-sky-600 hover:bg-sky-700 transition-colors mb-2',
            }}
          >
            <FileText size={20} />
            <span className="font-medium">Dynamic Reports</span>
          </Link>
          <Link
            to="/structured-output"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-pink-600 hover:bg-pink-700 transition-colors mb-2',
            }}
          >
            <FileJson size={20} />
            <span className="font-medium">Structured Output</span>
          </Link>
          <Link
            to="/banking-demo"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-teal-600 hover:bg-teal-700 transition-colors mb-2',
            }}
          >
            <Landmark size={20} />
            <span className="font-medium">Dynamic UI</span>
          </Link>
          <Link
            to="/execute-prompt"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-violet-600 hover:bg-violet-700 transition-colors mb-2',
            }}
          >
            <BarChart3 size={20} />
            <span className="font-medium">Execute Prompt</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-700 text-sm text-gray-400">
          <p className="mb-2">
            <strong className="text-white">Philosophy:</strong>
          </p>
          <p className="italic">
            "LLMs write the program, they don't be the program."
          </p>
        </div>
      </aside>

      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
