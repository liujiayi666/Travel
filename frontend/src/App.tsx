import { useState, useEffect } from 'react'

type Health = { status: string; database: string; time: number }
type LoadState =
  | { phase: 'loading' }
  | { phase: 'ok'; data: Health }
  | { phase: 'error'; message: string }

export default function App() {

  const [state, setState] = useState<LoadState>({
    phase: 'loading'
  })

  useEffect(() => { 
    //TODO: fetch health status from backend
    fetch('/api/healthz')
      .then(response => { 
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return response.json()
      })
      .then(data => {
        setState({ phase: 'ok', data })
      })
      .catch(error => {
        setState({ phase: 'error', message: error.message })
      })
  },[])


  return (
    <main style={{ fontFamily: 'sans-serif', padding: 40 }}>
      <h1>Travel Copilot</h1>
      {state.phase === 'loading' && <p>Loading…</p>}
      {state.phase === 'ok' && <p>API: {state.data.status} · DB: {state.data.database}</p>}
      {state.phase === 'error' && <p style={{ color: 'crimson' }}>{state.message}</p>}
    </main>
  )
}
