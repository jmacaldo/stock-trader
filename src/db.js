import { supabase } from './supabase'

// Returns the userId — restores existing session or creates a new anonymous one
export async function initSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user.id

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user.id
}

// Load all data for a user from Supabase
export async function loadData(userId) {
  const [{ data: account }, { data: positions }, { data: trades }] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('portfolio').select('*').eq('user_id', userId),
    supabase.from('trades').select('*').eq('user_id', userId).order('timestamp', { ascending: false }),
  ])
  return { account, positions: positions ?? [], trades: trades ?? [] }
}

// Upsert the account row (balance + starting balance + api key)
export function syncAccount(userId, balance, startingBalance, apiKey) {
  return supabase.from('accounts').upsert(
    { user_id: userId, balance, starting_balance: startingBalance, api_key: apiKey, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
}

// Upsert or delete a single portfolio position
export function syncPosition(userId, symbol, data) {
  if (!data) {
    return supabase.from('portfolio').delete().match({ user_id: userId, symbol })
  }
  return supabase.from('portfolio').upsert(
    { user_id: userId, symbol, name: data.name, shares: data.shares, avg_cost: data.avgCost, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,symbol' }
  )
}

// Insert a single trade record
export function insertTrade(userId, trade) {
  return supabase.from('trades').insert({
    id: trade.id,
    user_id: userId,
    symbol: trade.symbol,
    name: trade.name,
    type: trade.type,
    shares: trade.shares,
    price: trade.price,
    total: trade.total,
    timestamp: trade.timestamp,
  })
}

// Wipe portfolio + trades (used on account reset)
export function clearUserData(userId) {
  return Promise.all([
    supabase.from('portfolio').delete().eq('user_id', userId),
    supabase.from('trades').delete().eq('user_id', userId),
  ])
}
