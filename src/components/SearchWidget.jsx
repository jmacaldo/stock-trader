import { useState } from 'react'
import Search from './Search'
import StockQuote from './StockQuote'
import TradePanel from './TradePanel'

export default function SearchWidget({ initialQuote = null }) {
  const [quote, setQuote] = useState(initialQuote)

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {quote ? (
        <div className="p-4 space-y-4">
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
        <div className="p-4">
          <Search onSelect={setQuote} />
        </div>
      )}
    </div>
  )
}
