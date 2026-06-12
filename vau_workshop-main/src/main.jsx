import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { WorkshopTracker } from './WorkshopTracker'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <WorkshopTracker />
    </AuthProvider>
  </React.StrictMode>,
)