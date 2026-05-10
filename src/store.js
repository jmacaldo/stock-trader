import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DEFAULT_BALANCE = 10000

export const useStore = create(
  persist(
    (set, get) => ({
      apiKey: '',
      balance: DEFAULT_BALANCE,
      startingBalance: DEFAULT_BALANCE,
      portfolio: {},
      trades: [],

      setApiKey: (key) => set({ apiKey: key }),
      clearApiKey: () => set({ apiKey: '' }),

      buyStock: (symbol, name, shares, price) => {
        const { balance, portfolio } = get()
        const cost = parseFloat((shares * price).toFixed(2))
        if (cost > balance) return { error: 'Insufficient funds' }

        const existing = portfolio[symbol]
        const totalShares = parseFloat(((existing?.shares ?? 0) + shares).toFixed(6))
        const avgCost = existing
          ? parseFloat(((existing.shares * existing.avgCost + cost) / totalShares).toFixed(4))
          : price

        set({
          balance: parseFloat((balance - cost).toFixed(2)),
          portfolio: { ...portfolio, [symbol]: { name, shares: totalShares, avgCost } },
          trades: [
            { id: `${Date.now()}-${Math.random()}`, symbol, name, type: 'BUY', shares, price, total: cost, timestamp: new Date().toISOString() },
            ...get().trades,
          ],
        })
        return {}
      },

      sellStock: (symbol, shares, price) => {
        const { balance, portfolio } = get()
        const holding = portfolio[symbol]
        if (!holding || holding.shares < shares - 0.00001) return { error: 'Insufficient shares' }

        const proceeds = parseFloat((shares * price).toFixed(2))
        const newShares = parseFloat((holding.shares - shares).toFixed(6))
        const newPortfolio = { ...portfolio }
        if (newShares < 0.00001) {
          delete newPortfolio[symbol]
        } else {
          newPortfolio[symbol] = { ...holding, shares: newShares }
        }

        set({
          balance: parseFloat((balance + proceeds).toFixed(2)),
          portfolio: newPortfolio,
          trades: [
            { id: `${Date.now()}-${Math.random()}`, symbol, name: holding.name, type: 'SELL', shares, price, total: proceeds, timestamp: new Date().toISOString() },
            ...get().trades,
          ],
        })
        return {}
      },

      reset: (newStartingBalance) => {
        const amount = newStartingBalance ?? get().startingBalance
        set({ balance: amount, startingBalance: amount, portfolio: {}, trades: [] })
      },
    }),
    { name: 'paper-trader-v1' }
  )
)
