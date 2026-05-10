import { useState } from 'react'
import { useStore } from '../store'
import { validateApiKey } from '../api'

export default function ApiKeySetup({ onDone }) {
  const { setApiKey } = useStore()
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      await validateApiKey(trimmed)
      setApiKey(trimmed)
      onDone?.()
    } catch {
      setError('Could not verify that key. Double-check it and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-lg mb-5">P</div>
        <h1 className="text-xl font-bold text-white mb-1">PaperTrade Setup</h1>
        <p className="text-gray-400 text-sm mb-6">
          Real-time prices come from Finnhub. A free API key is required — getting one takes about 30 seconds.
        </p>

        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-6 space-y-2.5">
          <p className="text-sm font-medium text-gray-200">Get your free key:</p>
          <ol className="space-y-1.5">
            {[
              <>Go to <a href="https://finnhub.io/register" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">finnhub.io/register</a></>,
              'Create a free account (no credit card)',
              'Copy your API key from the dashboard',
              'Paste it below',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-400">
                <span className="w-5 h-5 rounded-full bg-gray-700 text-gray-300 text-xs flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Finnhub API Key</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your API key here..."
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={!key.trim() || loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold text-sm transition-colors"
          >
            {loading ? 'Verifying key...' : 'Connect & Start Trading'}
          </button>
        </form>

        <p className="text-xs text-gray-600 text-center mt-4">
          Free tier: 60 requests/min · Your key is stored locally in your browser
        </p>
      </div>
    </div>
  )
}
