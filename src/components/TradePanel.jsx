import { useState } from 'react'
import { useStore } from '../store'

const usd = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const fmtShares = (n) =>
  n < 0.0001 ? '0' : n < 1 ? n.toFixed(6) : n < 1000 ? n.toFixed(4) : n.toLocaleString('en-US', { maximumFractionDigits: 4 })

export default function TradePanel({ quote }) {
  const { balance, portfolio, buyStock, sellStock } = useStore()
  const [mode, setMode] = useState('BUY')
  const [amount, setAmount] = useState('')
  const [msg, setMsg] = useState(null)

  const price = quote?.regularMarketPrice ?? 0
  const symbol = quote?.symbol
  const name = quote?.shortName ?? symbol
  const holding = portfolio[symbol]
  const holdingValue = holding ? holding.shares * price : 0

  const dollars = parseFloat(amount) || 0
  const estimatedShares = price > 0 ? dollars / price : 0
  const afterCash = balance - dollars
  const afterValue = holdingValue - dollars

  const notify = (type, text) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  const handleTrade = () => {
    if (!dollars || dollars <= 0) return notify('error', 'Enter a dollar amount')
    if (mode === 'BUY' && dollars > balance) return notify('error', 'Amount exceeds available cash')
    if (mode === 'SELL' && dollars > holdingValue + 0.01)
      return notify('error', `Amount exceeds position value (${usd(holdingValue)})`)

    const shares = parseFloat((dollars / price).toFixed(6))

    const result = mode === 'BUY'
      ? buyStock(symbol, name, shares, price)
      : sellStock(symbol, shares, price)

    if (result.error) {
      notify('error', result.error)
    } else {
      notify('success', `${mode === 'BUY' ? 'Bought' : 'Sold'} ${usd(dollars)} of ${symbol} (${fmtShares(shares)} shares)`)
      setAmount('')
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex rounded-xl overflow-hidden border border-gray-700">
        {['BUY', 'SELL'].map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setMsg(null); setAmount('') }}
            className={`flex-1 py-2.5 text-sm font-bold tracking-wide transition-colors ${
              mode === m
                ? m === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {holding && (
        <div className="flex items-center justify-between text-xs bg-gray-800/60 rounded-lg px-3 py-2 text-gray-400">
          <span>{fmtShares(holding.shares)} shares · {usd(holdingValue)}</span>
          <span>Avg cost {usd(holding.avgCost)}</span>
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">
          {mode === 'BUY' ? 'Amount to invest' : 'Amount to sell'}
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
          <input
            type="number"
            min="0.01"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTrade()}
            placeholder="0.00"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-14 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors text-sm"
          />
          <button
            onClick={() => setAmount(
              mode === 'BUY'
                ? balance.toFixed(2)
                : holdingValue.toFixed(2)
            )}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors px-1"
          >
            MAX
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1">
          {mode === 'BUY'
            ? `Available: ${usd(balance)}`
            : holding ? `Position value: ${usd(holdingValue)}` : 'No position'}
        </p>
      </div>

      <div className="bg-gray-800/40 rounded-lg px-3 py-3 space-y-2 text-sm">
        <div className="flex justify-between text-gray-400">
          <span>Price per share</span>
          <span className="text-gray-200 tabular-nums">{usd(price)}</span>
        </div>
        <div className="flex justify-between text-gray-400">
          <span>Est. shares</span>
          <span className="text-gray-200 tabular-nums">{dollars > 0 ? fmtShares(estimatedShares) : '—'}</span>
        </div>
        <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold">
          <span className="text-gray-300">{mode === 'BUY' ? 'Total cost' : 'Proceeds'}</span>
          <span className="text-white tabular-nums">{dollars > 0 ? usd(dollars) : '—'}</span>
        </div>
        {dollars > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>{mode === 'BUY' ? 'Cash after' : 'Position after'}</span>
            <span className={
              (mode === 'BUY' ? afterCash : afterValue) < -0.01
                ? 'text-red-400'
                : 'text-gray-400'
            }>
              {mode === 'BUY' ? usd(Math.max(afterCash, 0)) : usd(Math.max(afterValue, 0))}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={handleTrade}
        disabled={!dollars || dollars <= 0}
        className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
          mode === 'BUY'
            ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98]'
            : 'bg-red-600 hover:bg-red-500 active:scale-[0.98]'
        }`}
      >
        {mode === 'BUY' ? 'Place Buy Order' : 'Place Sell Order'}
      </button>

      {msg && (
        <div className={`text-xs text-center rounded-lg px-3 py-2.5 leading-relaxed ${
          msg.type === 'error'
            ? 'bg-red-950/50 text-red-400 border border-red-900/40'
            : 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/40'
        }`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
