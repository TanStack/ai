import ProductList from './components/ProductList'
import Cart from './components/Cart'
import Chat from './components/Chat'

function App() {
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
          <h1>🎸 Guitar Shop</h1>
          <p>Find your perfect guitar with our AI sales assistant</p>
        </div>
        <Cart />
      </header>
      <main className="app-main">
        <div className="main-content">
          <div className="products-section">
            <h2 className="section-title">Our Collection</h2>
            <ProductList onAddToCart={handleAddToCart} />
          </div>
          <aside className="chat-sidebar">
            <div className="sidebar-header">
              <h3>Sales Assistant</h3>
              <p className="sidebar-subtitle">
                Ask me anything about our guitars!
              </p>
            </div>
            <Chat />
          </aside>
        </div>
      </main>
    </div>
  )
}

export default App
