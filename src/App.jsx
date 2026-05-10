import { useState, useEffect } from 'react'
import { useStore } from './store'
import { initSession, loadData, syncAccount } from './db'
import Header from './components/Header'
import Search from './components/Search'
import StockQuote from './components/StockQuote'
import TradePanel from './components/TradePanel'
import Portfolio from './components/Portfolio'
import History from './components/History'
import ApiKeySetup from './components/ApiKeySetup'
import LoadingScreen from './components/LoadingScreen'

export default function App() {
  const [quote, setQuote] = useState(null)
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [loading, setLoading] = useState(true)
  const { apiKey, setUserId, hydrateFromDb } = useStore()

  useEffect(() => {
    const init = async () => {
      try {
        const userId = await initSession()
        setUserId(userId)

        const data = await loadData(userId)

        if (data.account) {
          // Returning user — load their data from Supabase
          hydrateFromDb(data)
        } else {
          // First visit — create the account row with current local defaults
          const { balance, startingBalance, apiKey: localKey } = useStore.getState()
          await syncAccount(userId, balance, startingBalance, localKey)
        }
      } catch (err) {
        // DB unavailable — app still works from localStorage
        console.error('DB init failed, falling back to local state:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  if (loading) return <LoadingScreen />
  if (!apiKey) return <ApiKeySetup />

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Header portfolioValue={portfolioValue} />

      <main className="max-w-7xl mx-auto p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <Search onSelect={setQuote} />

            {quote ? (
              <>
                <StockQuote quote={quote} onUpdate={setQuote} onClose={() => setQuote(null)} />
                <TradePanel quote={quote} />
              </>
            ) : (
              <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-8 text-center">
                <div className="text-3xl mb-3 opacity-40">📈</div>
                <p className="text-gray-500 text-sm">Select a stock to view its price and start trading</p>
              </div>
            )}
          </div>

          <div className="lg:col-span-3 space-y-4">
            <Portfolio onValueChange={setPortfolioValue} />
            <History />
          </div>
        </div>
      </main>
    </div>
  )
}
