import { createRoot } from 'react-dom/client'
import { App } from '@paulus/ui'
import { installDevtoolsInspector } from './devtools-inspector'
import './styles.css'

installDevtoolsInspector()

const root = document.getElementById('root')!
createRoot(root).render(<App />)
