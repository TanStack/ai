import { useState } from 'react'
import Chat from './components/Chat'
import ProductList from './components/ProductList'
import Cart from './components/Cart'

function App() {
  const [activeTab, setActiveTab] = useState<'products' | 'chat'>('products')

  const handleAddToCart = async (purchasableId: string) => {
    try {
      const response = await fetch('http://localhost:8020/api/cart/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          purchasable_id: purchasableId,
          quantity: 1,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to add item to cart')
      }

      // Refresh cart by triggering a custom event
      window.dispatchEvent(new Event('cartUpdated'))
    } catch (error) {
      console.error('Error adding to cart:', error)
      alert('Failed to add item to cart')
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>TanStack AI - E-Commerce Example</h1>
          <p>Laravel + Lunar e-Commerce with AI Sales Assistant</p>
        </div>
        <Cart />
      </header>
      <main className="app-main">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            Products
          </button>
          <button
            className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Sales Assistant
          </button>
        </div>
        <div className="tab-content">
          {activeTab === 'products' && (
            <div className="products-section">
              <ProductList onAddToCart={handleAddToCart} />
            </div>
          )}
          {activeTab === 'chat' && (
            <div className="chat-section">
              <Chat />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
