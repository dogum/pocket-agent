import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/theme.css'
import './styles/shell.css'
import './styles/components.css'
import './styles/vocabulary.css'
import './styles/experiences/base.css'
import './styles/experiences/field-journal.css'
import './styles/experiences/daily-edition.css'
import './styles/experiences/observatory.css'
import './styles/experiences/workbench.css'
import './styles/experiences/quiet-atrium.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
