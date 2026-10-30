import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { AplicarPaleta } from './lib/aparencia.ts'
import { ProvedorSessao } from './lib/sessao.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AplicarPaleta />
    <BrowserRouter>
      <ProvedorSessao>
        <App />
      </ProvedorSessao>
    </BrowserRouter>
  </StrictMode>,
)
