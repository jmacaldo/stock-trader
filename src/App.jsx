import { useState, useEffect, lazy, Suspense } from 'react'
import { useStore } from './store'
import { supabase } from './supabase'
import { loadData, syncAccount } from './db'
import { ThemeProvider } from './useTheme'
import Header from './components/Header'
import Search from './components/Search'
import StockQuote from './components/StockQuote'
import TradePanel from './components/TradePanel'
import Portfolio from './components/Portfolio'
import History from './components/History'

const PortfolioChart = lazy(() => import('./components/PortfolioChart'))
const MarketMovers = lazy(() => import('./components/MarketMovers'))
import ApiKeySetup from './components/ApiKeySetup'
import AuthScreen from './components/AuthScreen'
import LoadingScreen from './components/LoadingScreen'

// 'loading' | 'auth' | 'setup' | 'app'
export default function App() {
  const [phase, setPhase] = useState('loading')
  const [quote, setQuote] = useState(null)
  const [portfolioValue, setPortfolioValue] = useState(0)
  const { setUserId, hydrateFromDb } = useStore()

  const loadUserData = async (userId) => {
    setUserId(userId)
    const data = await loadData(userId)
    if (data.account) {
      hydrateFromDb(data)
    } else {
      // First sign-in: start with clean defaults, persist to DB
      useStore.setState({ balance: 10000, startingBalance: 10000, portfolio: {}, trades: [] })
      const { apiKey } = useStore.getState()
      await syncAccount(userId, 10000, 10000, apiKey)
    }
  }

  const handleAuth = async (userId) => {
    setPhase('loading')
    try {
      await loadUserData(userId)
      const { apiKey } = useStore.getState()
      setPhase(apiKey ? 'app' : 'setup')
    } catch (err) {
      console.error('Failed to load account:', err)
      setPhase('auth')
    }
  }

  useEffect(() => {
    // Check for an existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await handleAuth(session.user.id)
      } else {
        setPhase('auth')
      }
    })

    // Keep phase in sync when auth state changes externally (sign out, token expiry)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useStore.setState({ userId: null, portfolio: {}, trades: [], balance: 10000, startingBalance: 10000 })
        setPhase('auth')
        setQuote(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Called by ApiKeySetup after the key is saved
  const handleKeySet = () => setPhase('app')

  return (
    <ThemeProvider>
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'auth' && <AuthScreen onAuth={handleAuth} />}
      {phase === 'setup' && <ApiKeySetup onDone={handleKeySet} />}
      {phase === 'app' && (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
          <Header portfolioValue={portfolioValue} />

          <main className="max-w-7xl mx-auto p-4 lg:p-6 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-2 space-y-4">
                <Search onSelect={setQuote} />
                {quote ? (
                  <>
                    <StockQuote quote={quote} onUpdate={setQuote} onClose={() => setQuote(null)} />
                    <TradePanel quote={quote} />
                  </>
                ) : (
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-dashed rounded-xl p-8 text-center">
                    <div className="text-3xl mb-3 opacity-40">📈</div>
                    <p className="text-gray-400 dark:text-gray-500 text-sm">Select a stock to view its price and start trading</p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-3 space-y-4">
                <Suspense fallback={null}>
                  <PortfolioChart />
                </Suspense>
                <Portfolio onValueChange={setPortfolioValue} />
                <History />
              </div>
            </div>

            <Suspense fallback={null}>
              <MarketMovers onSelect={setQuote} />
            </Suspense>
          </main>
        </div>
      )}
    </ThemeProvider>
  )
}
