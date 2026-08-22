// Session-level cache for ticker scores. Scores are derived from daily-close
// indicators, so they don't need the 30s/5min refresh cadence used for live
// quotes — a coarse TTL avoids re-fetching ~2y of history on every render.
import { supabase } from '../supabase'
import { fetchDailyCloses, fetchMacroSeries } from './data'
import { scoreMacro } from './macroPillar'
import { scoreSymbol } from './score'

const TICKER_TTL = 60 * 60 * 1000 // 1h
const MACRO_TTL = 4 * 60 * 60 * 1000 // 4h — shared regime score

// Closes are cached per symbol (the expensive part — a ~2y history fetch);
// the decision cascade is cheap to recompute per call, which matters because
// the same symbol is legitimately scored under different `holding` values
// (flat in Watchlist/MarketMovers, held in Portfolio) and those produce
// different decisions from the same indicators.
const closesCache = new Map() // symbol -> { at, promise }
let macroCache = null // { at, promise }

function getCloses(symbol) {
  const now = Date.now()
  const cached = closesCache.get(symbol)
  if (cached && now - cached.at < TICKER_TTL) return cached.promise

  const promise = fetchDailyCloses(symbol).catch(() => null)
  closesCache.set(symbol, { at: now, promise })
  return promise
}

function getMacroScore() {
  const now = Date.now()
  if (!macroCache || now - macroCache.at > MACRO_TTL) {
    macroCache = {
      at: now,
      promise: fetchMacroSeries()
        .then((series) => scoreMacro({ series }))
        .catch(() => null),
    }
  }
  return macroCache.promise
}

// Every signal the tool actually emits gets logged (see supabase/signal_log.sql)
// so predictive-edge questions can eventually be answered from the real
// population it surfaces instead of a hand-assembled, survivorship-biased
// backtest universe. Deduped per (symbol, path, day) within a session — the
// table's own unique constraint + upsert makes this safe even if it fires
// more than once for the same signal, this just avoids the redundant network
// calls when a component re-renders.
const loggedToday = new Set()

function logSignal(symbol, card, holding) {
  const signalDate = new Date().toISOString().split('T')[0]
  const path = holding === true ? 'held' : 'flat'
  const key = `${symbol}|${path}|${signalDate}`
  if (loggedToday.has(key)) return
  loggedToday.add(key)

  const { decision, pillars, indicators } = card
  const { raw, exhaustion, bearish, rebound, death_cross } = decision.flags
  supabase.from('signal_log').upsert({
    symbol,
    signal_date: signalDate,
    path,
    action: decision.action,
    trend_score: pillars.trend.score,
    momentum_score: pillars.momentum.score,
    n_exh: exhaustion.length,
    n_bear: bearish.length,
    n_reb: rebound.length,
    death_cross,
    rsi_turn: raw.rsiTurning,
    macd_shrink: raw.macdShrinking,
    at_band: raw.atUpperBand,
    stretched: raw.stretchedAboveEma20,
    price_at_signal: indicators.close,
  }, { onConflict: 'symbol,signal_date,path' }).then(({ error }) => {
    if (error) loggedToday.delete(key) // allow a retry on the next call if this one failed
  })
}

// Returns a full scoreSymbol() card for `symbol`, or null if there isn't
// enough price history to score it. `holding`: true | false | null.
export async function getTickerScore(symbol, { holding = null } = {}) {
  const [closes, macro] = await Promise.all([getCloses(symbol), getMacroScore()])
  if (!closes || closes.length < 30) return null
  try {
    const card = scoreSymbol(closes, { symbol, macroScore: macro?.pillarScore ?? null, holding })
    logSignal(symbol, card, holding)
    return card
  } catch {
    return null
  }
}
