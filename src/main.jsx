import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { watchForNewVersion } from './utils/newVersionBanner'

// A tab left open across a deploy holds chunk filenames that no longer exist; offer a reload
// instead of letting the next Excel export die with a raw module error.
watchForNewVersion()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
