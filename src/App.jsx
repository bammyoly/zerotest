import { useState } from 'react'
import RouterConfig from './routes/RouterConfig'
import Navbar from './components/Navbar'

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-indigo-500/30 overflow-x-hidden">
      <Navbar />
      <RouterConfig />
    </div>
  )
}

export default App