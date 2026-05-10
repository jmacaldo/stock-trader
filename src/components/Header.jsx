import { useState } from 'react'
import { useStore } from '../store'

const usd = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export default function Header({ portfolioValue }) {
  const { balance, startingBalance, reset, clearApiKey } = useStore()
  const [showReset, setShowReset] = useState(false)
  const [newBalance, setNewBalance] = useState('')

  const totalValue = balance + (portfolioValue ?? 0)
  const pnl = totalValue - startingBalance
  const pnlPct = startingBalance > 0 ? (pnl / startingBalance) * 100 : 0
  const isUp = pnl >= 0

  const handleReset = () => {
    const amount = parseFloat(newBalance) || startingBalance
    if (amount > 0) {
      reset(amount)
      setShowReset(false)
      setNewBalance('')
    }
  }

  return (
    <>
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">PaperTrade</h1>
              <p className="text-xs text-gray-500 leading-none mt-0.5">Paper Trading Simulator</p>
            </div>
          </div>

          <div className="flex items-center gap-5 flex-wrap">
            <Stat label="Cash" value={usd(balance)} />
            <div className="w-px h-8 bg-gray-800" />
            <Stat label="Holdings" value={usd(portfolioValue ?? 0)} />
            <div className="w-px h-8 bg-gray-800" />
            <Stat label="Total Value" value={usd(totalValue)} emphasis />
            <div className="w-px h-8 bg-gray-800" />
            <Stat
              label="Total P&L"
              value={`${isUp ? '+' : ''}${usd(pnl)}  (${isUp ? '+' : ''}${pnlPct.toFixed(2)}%)`}
              color={isUp ? 'text-emerald-400' : 'text-red-400'}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowReset(true)}
              className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg transition-colors border border-gray-700"
            >
              Reset Account
            </button>
            <button
              onClick={clearApiKey}
              className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-600 hover:text-gray-400 rounded-lg transition-colors border border-gray-700"
              title="Change API key"
            >
              API Key
            </button>
          </div>
        </div>
      </header>

      {showReset && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-80 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">Reset Account</h3>
            <p className="text-xs text-gray-500 mb-4">All holdings and history will be cleared.</p>
            <label className="block text-xs text-gray-400 mb-1.5">Starting Balance</label>
            <div className="relative mb-4">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="100"
                step="1000"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                placeholder={startingBalance.toLocaleString()}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Reset
              </button>
              <button
                onClick={() => { setShowReset(false); setNewBalance('') }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, color = 'text-gray-200', emphasis }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${color} ${emphasis ? 'text-white' : ''}`}>{value}</p>
    </div>
  )
}
