import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PeerJSRoomVideoCall from './videocall.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PeerJSRoomVideoCall />
  </StrictMode>,
)
