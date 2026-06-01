import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'
import { initTelegramWebAppUI } from './lib/telegram'
import { AppProviders } from './bootstrap/AppProviders'
import { createDependencies } from './bootstrap/createDependencies'

initTelegramWebAppUI()
const deps = createDependencies()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders deps={deps}>
      <App />
    </AppProviders>
  </React.StrictMode>
)
