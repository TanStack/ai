import { Link } from '@tanstack/react-router'

import { useState } from 'react'
import {
  Beaker,
  ChefHat,
  FileText,
  FlaskConical,
  Home,
  ImageIcon,
  Menu,
  Mic,
  Package,
  Video,
  Volume2,
  X,
} from 'lucide-react'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <header className="p-4 flex items-center bg-gray-800 text-white shadow-lg">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
        <h1 className="ml-4 text-xl font-semibold">
          <Link to="/">
            <img
              src="/tanstack-word-logo-white.svg"
              alt="TanStack Logo"
              className="h-10"
            />
          </Link>
        </h1>
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
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <Home size={20} />
            <span className="font-medium">Chat</span>
          </Link>

          <Link
            to="/stream-debugger"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <FlaskConical size={20} />
            <span className="font-medium">Stream Debugger</span>
          </Link>

          <Link
            to="/addon-manager"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-green-600 hover:bg-green-700 transition-colors mb-2',
            }}
          >
            <Package size={20} />
            <div className="flex items-center gap-2">
              <span className="font-medium">Add-on Manager</span>
              <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                Multi-Tool
              </span>
            </div>
          </Link>

          <Link
            to="/simulator"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors mb-2',
            }}
          >
            <Beaker size={20} />
            <div className="flex items-center gap-2">
              <span className="font-medium">Tool Simulator</span>
              <span className="text-xs px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                Mock
              </span>
            </div>
          </Link>

          <div className="my-4 border-t border-gray-700" />
          <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Activities
          </p>

          <Link
            to="/summarize"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <FileText size={20} />
            <span className="font-medium">Summarize</span>
          </Link>

          <Link
            to="/image"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <ImageIcon size={20} />
            <span className="font-medium">Image Generation</span>
          </Link>

          <Link
            to="/video"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors mb-2',
            }}
          >
            <Video size={20} />
            <div className="flex items-center gap-2">
              <span className="font-medium">Video Generation</span>
              <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                Exp
              </span>
            </div>
          </Link>

          <Link
            to="/tts"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 transition-colors mb-2',
            }}
          >
            <Volume2 size={20} />
            <span className="font-medium">Text-to-Speech</span>
          </Link>

          <Link
            to="/transcription"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-amber-600 hover:bg-amber-700 transition-colors mb-2',
            }}
          >
            <Mic size={20} />
            <span className="font-medium">Transcription</span>
          </Link>

          <Link
            to="/structured"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition-colors mb-2"
            activeProps={{
              className:
                'flex items-center gap-3 p-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 transition-colors mb-2',
            }}
          >
            <ChefHat size={20} />
            <span className="font-medium">Structured Output</span>
          </Link>
        </nav>
      </aside>
    </>
  )
}
