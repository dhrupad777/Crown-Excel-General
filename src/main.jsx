import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { watchForNewVersion } from './utils/newVersionBanner'
import { storageService } from './services/storage'

// A tab left open across a deploy holds chunk filenames that no longer exist; offer a reload
// instead of letting the next Excel export die with a raw module error.
watchForNewVersion()

const render = () =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>,
  )

// The device's copy of the data lives in IndexedDB, which is read asynchronously — so it is loaded
// into memory BEFORE the first render. Every getter in storage.js is synchronous and a few of them
// feed read-modify-write saves; rendering first would let a component read an empty list and write
// that emptiness back. `.finally` rather than `.then`: if the mirror cannot be opened at all, the
// service falls back to localStorage on its own and the app must still start.
storageService.initLocalMirror().finally(render)
