import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { syncAccount, syncPosition, insertTrade, clearUserData, clearPositions } from './db'

const DEFAULT_BALANCE = 10000

export const useStore = create(
  persist(
    (set, get) => ({
      userId: null,
      apiKey: '',
      balance: DEFAULT_BALANCE,
      startingBalance: DEFAULT_BALANCE,
      portfolio: {},
      trades: [],
      watchlist: [],
      wallet: 0,

      setUserId: (id) => set({ userId: id }),
      setWatchlist: (items) => set({ watchlist: items }),

      setApiKey: (key) => {
        set({ apiKey: key })
        const { userId, balance, startingBalance, wallet } = get()
        if (userId) syncAccount(userId, balance, startingBalance, key, wallet).catch(console.error)
      },

      clearApiKey: () => set({ apiKey: '' }),

      // Called on app start to override local state with Supabase data
      hydrateFromDb: ({ account, positions, trades }) => {
        const portfolio = {}
        positions.forEach((row) => {
          portfolio[row.symbol] = {
            name: row.name,
            shares: parseFloat(row.shares),
            avgCost: parseFloat(row.avg_cost),
          }
        })
        set({
          balance: parseFloat(account.balance),
          startingBalance: parseFloat(account.starting_balance),
          apiKey: account.api_key || get().apiKey,
          wallet: parseFloat(account.wallet ?? 0),
          portfolio,
          trades: trades.map((t) => ({
            id: t.id,
            symbol: t.symbol,
            name: t.name,
            type: t.type,
            shares: parseFloat(t.shares),
            price: parseFloat(t.price),
            total: parseFloat(t.total),
            timestamp: t.timestamp,
          })),
        })
      },

      buyStock: (symbol, name, shares, price) => {
        const { balance, portfolio, userId, startingBalance, apiKey } = get()
        const cost = parseFloat((shares * price).toFixed(2))

        const existing = portfolio[symbol]
        const totalShares = parseFloat(((existing?.shares ?? 0) + shares).toFixed(8))
        const avgCost = existing
          ? parseFloat(((existing.shares * existing.avgCost + cost) / totalShares).toFixed(6))
          : price

        const newPosition = { name, shares: totalShares, avgCost }
        const trade = {
          id: `${Date.now()}-${Math.random()}`,
          symbol, name, type: 'BUY', shares, price, total: cost,
          timestamp: new Date().toISOString(),
        }

        set({
          portfolio: { ...portfolio, [symbol]: newPosition },
          trades: [trade, ...get().trades],
        })

        if (userId) {
          Promise.all([
            syncAccount(userId, balance, startingBalance, apiKey, get().wallet),
            syncPosition(userId, symbol, newPosition),
            insertTrade(userId, trade),
          ]).catch(console.error)
        }
        return {}
      },

      sellStock: (symbol, shares, price) => {
        const { balance, portfolio, userId, startingBalance, apiKey } = get()
        const holding = portfolio[symbol]
        if (!holding || holding.shares < shares - 0.000001) return { error: 'Insufficient shares' }

        const proceeds = parseFloat((shares * price).toFixed(2))
        const newShares = parseFloat((holding.shares - shares).toFixed(8))
        const newPortfolio = { ...portfolio }
        const removedPosition = newShares < 0.000001

        if (removedPosition) {
          delete newPortfolio[symbol]
        } else {
          newPortfolio[symbol] = { ...holding, shares: newShares }
        }

        const newBalance = parseFloat((balance + proceeds).toFixed(2))
        const newWallet  = parseFloat(((get().wallet ?? 0) + proceeds).toFixed(2))
        const trade = {
          id: `${Date.now()}-${Math.random()}`,
          symbol, name: holding.name, type: 'SELL', shares, price, total: proceeds,
          timestamp: new Date().toISOString(),
        }

        set({ balance: newBalance, wallet: newWallet, portfolio: newPortfolio, trades: [trade, ...get().trades] })

        if (userId) {
          Promise.all([
            syncAccount(userId, newBalance, startingBalance, apiKey, newWallet),
            syncPosition(userId, symbol, removedPosition ? null : newPortfolio[symbol]),
            insertTrade(userId, trade),
          ]).catch(console.error)
        }
        return {}
      },

      reset: (newStartingBalance) => {
        const { userId, apiKey } = get()
        const amount = newStartingBalance ?? get().startingBalance
        set({ balance: amount, startingBalance: amount, portfolio: {}, trades: [], wallet: 0 })

        if (userId) {
          Promise.all([
            clearUserData(userId),
            syncAccount(userId, amount, amount, apiKey, 0),
          ]).catch(console.error)
        }
      },

      // Deletes every paper position — balance, wallet, and trade history are untouched
      clearPortfolio: () => {
        const { userId } = get()
        set({ portfolio: {} })
        if (userId) clearPositions(userId).catch(console.error)
      },
    }),
    { name: 'paper-trader-v1' }
  )
)
