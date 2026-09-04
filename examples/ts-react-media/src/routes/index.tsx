import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Clapperboard,
  Film,
  Globe,
  ImageIcon,
  Radio,
  Sparkles,
} from 'lucide-react'
import ImageGenerator from '@/components/ImageGenerator'
import LiveVideoStudio from '@/components/LiveVideoStudio'
import OmniStudio from '@/components/OmniStudio'
import VideoGenerator from '@/components/VideoGenerator'
import WorldStudio from '@/components/WorldStudio'

type Tab = 'image' | 'video' | 'live' | 'world' | 'omni'

function VisualPage() {
  const [activeTab, setActiveTab] = useState<Tab>('image')
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(
    null,
  )

  return (
    <div className="min-h-[calc(100vh-72px)] bg-gray-900 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Visual Content Generator
          </h1>
          <p className="text-gray-400">
            Generate images, videos, live streams, and worlds using AI models
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'image'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <ImageIcon className="w-5 h-5" />
            Image
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'video'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Film className="w-5 h-5" />
            Video
          </button>
          <button
            onClick={() => setActiveTab('live')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'live'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Radio className="w-5 h-5" />
            Live
          </button>
          <button
            onClick={() => setActiveTab('world')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'world'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Globe className="w-5 h-5" />
            World
          </button>
          <button
            onClick={() => setActiveTab('omni')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'omni'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            Omni Studio
          </button>
          <Link
            to="/seedance"
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-gray-800 text-gray-300 hover:bg-gray-700"
          >
            <Clapperboard className="w-5 h-5" />
            Seedance Studio
          </Link>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          {activeTab === 'image' ? (
            <ImageGenerator onImageGenerated={setLastGeneratedImage} />
          ) : activeTab === 'video' ? (
            <VideoGenerator initialImageUrl={lastGeneratedImage} />
          ) : activeTab === 'live' ? (
            <LiveVideoStudio />
          ) : activeTab === 'world' ? (
            <WorldStudio />
          ) : (
            <OmniStudio />
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: VisualPage,
})
