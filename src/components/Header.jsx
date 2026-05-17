import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { supabase } from '../supabase'
import { useTheme } from '../useTheme'

const usd = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

export default function Header({ portfolioValue, realSummary, view, onViewChange }) {
  const { startingBalance, wallet, portfolio } = useStore()
  const invested = Object.values(portfolio ?? {}).reduce((sum, p) => sum + p.shares * p.avgCost, 0)
  const { dark, toggle } = useTheme()
  const [userEmail, setUserEmail] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email ?? null))
  }, [])

  const handleSignOut = () => supabase.auth.signOut()

  const isPaper = view === 'dashboard'
  const totalValue = isPaper ? (portfolioValue ?? 0) : (realSummary?.totalValue ?? 0)
  const pnl       = isPaper ? (portfolioValue ?? 0) - invested : (realSummary?.totalGain ?? 0)
  const pnlPct    = isPaper
    ? (invested > 0 ? (pnl / invested) * 100 : 0)
    : (realSummary?.totalGainPct ?? 0)
  const isUp = pnl >= 0
  const hasData = isPaper ? true : !!realSummary

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-none">PaperTrade</h1>
            <p className="text-xs text-gray-500 leading-none mt-0.5">Paper Trading Simulator</p>
          </div>
        </div>

        <div className="flex items-center gap-5 flex-wrap">
          <Stat label="Total Value" value={hasData ? usd(totalValue) : '—'} emphasis />
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
          <Stat
            label="Total P&L"
            value={hasData ? `${isUp ? '+' : ''}${usd(pnl)} (${isUp ? '+' : ''}${pnlPct.toFixed(2)}%)` : '—'}
            color={isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
          />
          {isPaper && (
            <>
              <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
              <Stat label="Wallet" value={usd(wallet ?? 0)} color="text-emerald-600 dark:text-emerald-400" />
              <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
              <Stat label="Invested" value={usd(invested)} />
            </>
          )}
        </div>

        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
          {[{ id: 'holdings', label: 'Real' }, { id: 'dashboard', label: 'Paper' }].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                view === id
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
           {userEmail && (
            <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-600 max-w-[140px] truncate" title={userEmail}>
              {userEmail}
            </span>
          )}
          <button
            onClick={toggle}
            className="p-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            onClick={handleSignOut}
            className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-600 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  )
}

function Stat({ label, value, color = 'text-gray-700 dark:text-gray-200', emphasis }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${color} ${emphasis ? 'text-gray-900 dark:text-white' : ''}`}>{value}</p>
    </div>
  )
}
