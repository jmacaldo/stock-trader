import { useState, useEffect, lazy, Suspense } from 'react'
import { useStore } from './store'
import { supabase } from './supabase'
import { loadData, syncAccount } from './db'
import { ThemeProvider } from './useTheme'
import Header from './components/Header'
import SearchModal from './components/SearchModal'
import Portfolio from './components/Portfolio'
import History from './components/History'

const PortfolioChart = lazy(() => import('./components/PortfolioChart'))
const RealHoldings   = lazy(() => import('./components/RealHoldings'))
const MarketMovers   = lazy(() => import('./components/MarketMovers'))
const SearchWidget   = lazy(() => import('./components/SearchWidget'))
const Watchlist      = lazy(() => import('./components/Watchlist'))
import ApiKeySetup from './components/ApiKeySetup'
import AuthScreen from './components/AuthScreen'
import LoadingScreen from './components/LoadingScreen'

// 'loading' | 'auth' | 'setup' | 'app'
export default function App() {
  const [phase, setPhase] = useState('loading')
  const [view, setView] = useState('holdings')
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [realSummary, setRealSummary] = useState(null)
  const [modalQuote, setModalQuote] = useState(null)
  const { setUserId, hydrateFromDb } = useStore()

  const loadUserData = async (userId) => {
    setUserId(userId)
    const data = await loadData(userId)
    if (data.account) {
      hydrateFromDb(data)
    } else {
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await handleAuth(session.user.id)
      } else {
        setPhase('auth')
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useStore.setState({ userId: null, portfolio: {}, trades: [], balance: 10000, startingBalance: 10000 })
        setPhase('auth')
        setModalQuote(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleKeySet = () => setPhase('app')

  const openModal = (quote = null) => setModalQuote(quote ?? true)
  const closeModal = () => setModalQuote(null)

  return (
    <ThemeProvider>
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'auth' && <AuthScreen onAuth={handleAuth} />}
      {phase === 'setup' && <ApiKeySetup onDone={handleKeySet} />}
      {phase === 'app' && (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
          <Header portfolioValue={portfolioValue} realSummary={realSummary} view={view} onViewChange={setView} />

          {modalQuote && (
            <SearchModal
              initialQuote={modalQuote === true ? null : modalQuote}
              onClose={closeModal}
            />
          )}

          <main className="max-w-7xl mx-auto p-4 lg:p-6">
            {/* Real tab wrapper — always mounted so Watchlist state survives tab switches */}
            <div className={`space-y-5${view !== 'holdings' ? ' hidden' : ''}`}>
              {/* RealHoldings conditionally rendered — has Recharts charts that error at 0 dimensions */}
              {view === 'holdings' && (
                <Suspense fallback={null}>
                  <RealHoldings onSummaryChange={setRealSummary} />
                </Suspense>
              )}
              {/* Watchlist always mounted — no charts, state must survive tab switches */}
              <Suspense fallback={null}>
                <Watchlist onSelect={(quote) => openModal(quote)} />
              </Suspense>
            </div>
            {/* Paper tab — only mounted when active so Recharts can measure its container */}
            {view !== 'holdings' && (
              <div className="space-y-5">
                <Suspense fallback={null}>
                  <SearchWidget />
                </Suspense>
                <Suspense fallback={null}>
                  <PortfolioChart />
                </Suspense>
                <Portfolio onValueChange={setPortfolioValue} />
                <History />
                <Suspense fallback={null}>
                  <MarketMovers onSelect={(quote) => openModal(quote)} />
                </Suspense>
              </div>
            )}
          </main>
        </div>
      )}
    </ThemeProvider>
  )
}
