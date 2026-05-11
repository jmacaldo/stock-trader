import { useState, useRef, useEffect } from 'react'
import { fetchQuote } from '../api'
import { searchStocks } from '../stocks'

const POPULAR = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 'META', 'SPY']

export default function Search({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const containerRef = useRef(null)

  // Local filtering — instant, no network call
  useEffect(() => {
    setResults(query.trim() ? searchStocks(query) : [])
    setError(null)
  }, [query])

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setResults([])
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = async (symbol) => {
    setQuery('')
    setResults([])
    setLoading(true)
    setError(null)
    try {
      const quote = await fetchQuote(symbol)
      onSelect(quote)
    } catch {
      setError(`Could not load quote for "${symbol}". Check the symbol and try again.`)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const sym = query.trim().toUpperCase()
    if (sym) handleSelect(sym)
  }

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative">
        <form onSubmit={handleSubmit}>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Symbol or company name..."
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-10 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-sm"
            />
            {loading ? (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            ) : query ? (
              <button
                type="button"
                onClick={() => { setQuery(''); setResults([]) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400"
              >
                ×
              </button>
            ) : null}
          </div>
        </form>

        {results.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-2xl">
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => handleSelect(r.symbol)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-gray-900 dark:text-white text-sm w-14 shrink-0">{r.symbol}</span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm truncate">{r.name}</span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded shrink-0 ml-2">{r.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-500 dark:text-red-400 px-1">{error}</p>}

      <div>
        <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-2 px-1">Popular</p>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR.map((sym) => (
            <button
              key={sym}
              onClick={() => handleSelect(sym)}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-full text-xs font-mono font-semibold transition-colors"
            >
              {sym}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
