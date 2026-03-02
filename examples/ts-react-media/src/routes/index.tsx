import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Film, ImageIcon } from 'lucide-react'
import ImageGenerator from '@/components/ImageGenerator'
import VideoGenerator from '@/components/VideoGenerator'

type Tab = 'image' | 'video'

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
            Generate images and videos using AI models
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
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
          {activeTab === 'image' ? (
            <ImageGenerator onImageGenerated={setLastGeneratedImage} />
          ) : (
            <VideoGenerator initialImageUrl={lastGeneratedImage} />
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: VisualPage,
})
