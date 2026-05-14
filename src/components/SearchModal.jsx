import { useState, useEffect } from 'react'
import Search from './Search'
import StockQuote from './StockQuote'
import TradePanel from './TradePanel'

export default function SearchModal({ initialQuote = null, onClose }) {
  const [quote, setQuote] = useState(initialQuote)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-16 px-4 pb-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg relative border border-gray-200 dark:border-gray-700 max-h-[85vh] overflow-y-auto scrollbar-hide">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {quote ? (
          <div className="p-5 space-y-4">
            <button
              onClick={() => setQuote(null)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to search
            </button>
            <StockQuote quote={quote} onUpdate={setQuote} onClose={() => setQuote(null)} />
            <TradePanel quote={quote} />
          </div>
        ) : (
          <div className="p-5">
            <Search onSelect={setQuote} autoFocus />
          </div>
        )}
      </div>
    </div>
  )
}
