import Chat from './components/Chat'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>TanStack AI - Laravel Example</h1>
        <p>React frontend with Laravel backend using SSE streaming</p>
      </header>
      <main className="app-main">
        <Chat />
      </main>
    </div>
  )
}

export default App
