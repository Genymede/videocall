import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PeerJSRoomVideoCall from './videocall.jsx'
import LocationSettings from './LocationSettings.jsx'
import ClientApp from './client.jsx'
import HostApp from './host.jsx'


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HostApp />
  </StrictMode>,
)
