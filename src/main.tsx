import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setSearchDebug } from 'cubing/search'
import './index.css'
import App from './App.tsx'

// cubing.js's scramble/solve search runs in a worker and tries several
// bundler-compatibility strategies to locate its own worker script. Its
// default order tries `import.meta.resolve(...)` first, which esbuild/Vite
// production builds don't rewrite correctly, leaving the worker looking for
// an unhashed filename that 404s. Prioritizing the esbuild-specific
// workaround (which Vite *does* handle) avoids that dead end.
setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
