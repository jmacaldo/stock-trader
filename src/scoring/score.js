// Three-pillar scorecard + exit/re-entry decision logic
// (ported from agentic-trading-desk's score.py).
//
// Converts the indicator stack into Trend / Momentum / Macro-Sentiment pillars
// (each -2..+2) and applies a capital-rotation decision cascade: enter on
// rebound -> ride -> exit on exhaustion -> wait for the next trigger.
import * as I from './indicators.js'

// Pillar 1: Trend (EMA structure + price position + long-term slope)
function scoreTrend(ind) {
  const c = ind.close
  const { ema20: e20, ema50: e50, ema200: e200, ema200_slope: s200 } = ind
  let pts = 0
  const bits = []
  if (e20 != null) {
    if (c > e20) { pts += 1; bits.push('price>EMA20') } else { pts -= 1; bits.push('price<EMA20') }
  }
  if (e20 != null && e50 != null) {
    if (e20 > e50) { pts += 1; bits.push('EMA20>EMA50') } else { pts -= 1; bits.push('EMA20<EMA50') }
  }
  if (e50 != null && e200 != null) {
    if (e50 > e200) { pts += 1; bits.push('EMA50>EMA200') } else { pts -= 1; bits.push('EMA50<EMA200') }
  }
  if (s200 != null) {
    if (s200 > 0) { pts += 1; bits.push('EMA200↑') } else { pts -= 1; bits.push('EMA200↓') }
  }
  const score = pts >= 3 ? 2 : pts >= 1 ? 1 : pts === 0 ? 0 : pts >= -2 ? -1 : -2
  return { score, detail: bits.join(', ') }
}

// Pillar 2: Momentum (RSI-Wilder + MACD histogram + TRIX)
function scoreMomentum(ind) {
  const { rsi14: rsi, macd_hist: hist, trix, trix_signal: trixSig } = ind
  let pts = 0
  const bits = []
  if (rsi != null) {
    if (rsi >= 55) { pts += 1; bits.push(`RSI ${rsi.toFixed(0)}≥55`) }
    else if (rsi <= 45) { pts -= 1; bits.push(`RSI ${rsi.toFixed(0)}≤45`) }
    else bits.push(`RSI ${rsi.toFixed(0)} neutral`)
  }
  if (hist != null) {
    if (hist > 0) { pts += 1; bits.push('MACD hist>0') } else { pts -= 1; bits.push('MACD hist<0') }
  }
  if (trix != null && trixSig != null) {
    if (trix > trixSig && trix > 0) { pts += 1; bits.push('TRIX>signal>0') }
    else if (trix < trixSig && trix < 0) { pts -= 1; bits.push('TRIX<signal<0') }
    else bits.push('TRIX mixed')
  }
  const score = pts >= 2 ? 2 : pts === 1 ? 1 : pts === 0 ? 0 : pts === -1 ? -1 : -2
  return { score, detail: bits.join(', ') }
}

function computeFlags(ind) {
  const c = ind.close
  const { ema20: e20, ema50: e50, ema200: e200, ema200_slope: s200 } = ind
  const rsi = ind.rsi14, rsiPrev = ind.rsi14_prev
  const hist = ind.macd_hist, histPrev = ind.macd_hist_prev
  const trix = ind.trix, trixSig = ind.trix_signal
  const pb = ind.percent_b
  const stretch = e20 ? c / e20 - 1.0 : 0.0

  const exhaustion = [], bearish = [], rebound = []

  // Bullish exhaustion
  if (rsi != null && rsiPrev != null && rsi >= 70 && rsi < rsiPrev) {
    exhaustion.push(`RSI turning from overbought (${rsiPrev.toFixed(0)}→${rsi.toFixed(0)})`)
  }
  if (hist != null && histPrev != null && hist > 0 && hist < histPrev) {
    exhaustion.push('MACD histogram shrinking in positive territory')
  }
  if (pb != null && pb >= 1.0) {
    exhaustion.push('price at/above upper Bollinger Band (%B≥1)')
  }
  if (stretch >= 0.10) {
    exhaustion.push(`price stretched ${(stretch * 100).toFixed(0)}% above EMA20`)
  }

  // Relentless bearish
  if (e50 && e200 && s200 != null && c < e50 && e50 < e200 && s200 < 0) {
    bearish.push('price<EMA50<EMA200 with EMA200↓')
  }
  if (hist != null && histPrev != null && hist < 0 && hist < histPrev) {
    bearish.push('MACD histogram deepening in negative territory')
  }
  if (trix != null && trixSig != null && trix < trixSig && trix < 0) {
    bearish.push('TRIX<signal below zero')
  }
  if (rsi != null && rsiPrev != null && rsi < 45 && rsi < rsiPrev) {
    bearish.push(`RSI weak and falling (${rsi.toFixed(0)})`)
  }

  // Rebound / reversal (for re-entry)
  if (rsi != null && rsiPrev != null && rsiPrev < 35 && rsi > rsiPrev) {
    rebound.push(`RSI turning from oversold (${rsiPrev.toFixed(0)}→${rsi.toFixed(0)})`)
  }
  if (hist != null && histPrev != null && hist > histPrev && histPrev < 0) {
    rebound.push('MACD histogram crossing bullishly')
  }
  const bsb = ind.bars_since_below_ema20
  if (e20 && c > e20 && ind.ema20_slope != null && ind.ema20_slope > 0 &&
      bsb != null && bsb >= 1 && bsb <= 5) {
    rebound.push(`price reclaims EMA20 (closed below ${bsb} bar${bsb > 1 ? 's' : ''} ago)`)
  }
  const trixPrev = ind.trix_prev, sigPrev = ind.trix_signal_prev
  if (trix != null && trixSig != null && trixPrev != null && sigPrev != null &&
      trix > trixSig && trixPrev <= sigPrev && trix <= 0) {
    rebound.push('fresh bullish TRIX cross below zero')
  }

  const deathCross = Boolean(e50 && e200 && e50 < e200 && c < e50)

  return { exhaustion, bearish, rebound, death_cross: deathCross, stretch_pct: Math.round(stretch * 1000) / 10 }
}

// Decision cascade aligned to a capital-rotation style: enter on rebound -> ride
// -> exit on exhaustion -> wait for next trigger. Accumulating positions is not
// the default. A rebound inside a death-cross is a counter-trend TACTICAL
// opportunity, not a new cycle.
function decide(ind, trend, mom, macro, holding) {
  const f = computeFlags(ind)
  const nExh = f.exhaustion.length, nBear = f.bearish.length, nReb = f.rebound.length
  const dc = f.death_cross
  const inPos = holding === true

  let action, rationale, framing

  if (inPos && nExh >= 2) {
    action = 'EXIT / TRIM'
    rationale = 'Bullish momentum EXHAUSTED.'
    framing = 'Partial or full exit: buying momentum is dying out. Rotate capital and flag for re-entry on the next rebound.'
  } else if (inPos && (nBear >= 3 || (dc && nBear >= 2))) {
    action = 'EXIT'
    rationale = 'Bearish momentum RELENTLESS.'
    framing = 'Exit: selling pressure is sustained. Do not average down.'
    if (nReb >= 2) framing += ' Rebound in progress: use it to exit at a better price, not to justify holding.'
  } else if (!inPos && nReb >= 2 && !dc) {
    action = 'RE-ENTRY (new cycle)'
    rationale = 'Rebound/reversal with healthy EMA structure: likely start of a new bullish cycle.'
    framing = 'Valid entry trigger. Confirm with candle/volume before entering full size; stop below the rebound pivot.'
  } else if (!inPos && nReb >= 2 && dc) {
    action = 'TACTICAL REBOUND (counter-trend)'
    rationale = 'Rebound signals within a death-cross: tactical trade, NOT a new cycle.'
    framing = 'Short-term opportunity against the structure: reduced size, close target (EMA20/EMA50 or middle band), tight stop, and quick exit. Do not let it turn into a hold — the underlying trend remains bearish.'
    if (nBear >= 2) framing += ' Bearish flags still active: extra tight leash.'
  } else if (!inPos && (nBear >= 3 || (dc && nBear >= 2))) {
    action = 'STAY OUT / AVOID'
    rationale = 'Bearish momentum RELENTLESS, no fresh rebound trigger.'
    framing = 'Out. Watch for capitulation: the trigger would be a fresh RSI/MACD turn.'
  } else if (trend >= 1 && mom >= 1) {
    if (inPos) {
      action = 'HOLD (ride the cycle)'
      rationale = 'Bullish cycle intact (Trend and Momentum positive).'
      framing = 'Hold and watch for exhaustion: the next expected action is EXIT with profit, not adding to position. Accumulating is not the default (capital rotation > large position).'
    } else {
      action = 'WAIT (do not chase)'
      rationale = 'Healthy trend but no fresh entry trigger.'
      framing = 'Entering mid-trend is chasing: poor R/R for the short term. Wait for pullback to EMA20 and turn, or the next confirmed rebound.'
    }
  } else if (trend <= -1 && mom <= -1) {
    if (inPos) {
      action = 'HOLD (under review)'
      rationale = 'Weak structure and momentum, but no full exit trigger.'
      framing = 'Do not add. Prepare to exit: if more bearish flags appear or the current rebound fizzles out, execute EXIT. If a rebound is active, it can be used to exit at a better price.'
    } else {
      action = 'STAY OUT / AVOID'
      rationale = 'Negative structure and momentum, no signs of turning.'
      framing = 'Out. The next trigger here would be a confirmed rebound (tactical trade).'
    }
  } else {
    action = inPos ? 'HOLD / OBSERVE' : 'OBSERVE'
    rationale = 'Mixed signals; no clear exhaustion or rebound trigger.'
    framing = 'No action. Watch the next close.'
  }

  if (macro != null && macro <= -1) {
    if (action === 'HOLD (ride the cycle)') framing += ' ⚠ Adverse macro: lower the exit threshold (take profit earlier).'
    else if (action === 'TACTICAL REBOUND (counter-trend)') framing += ' ⚠ Adverse macro: reduce size further or skip this rebound.'
    else if (action === 'RE-ENTRY (new cycle)') framing += ' ⚠ Adverse macro: entry in reduced size.'
  }

  if (inPos && nReb >= 2 && action.startsWith('HOLD')) {
    framing += ' (Rebound signals in progress reinforce holding.)'
  }
  if (holding === false && (action === 'EXIT / TRIM' || action === 'EXIT')) {
    framing += ' (You are flat: the exit signal only confirms not entering long.)'
  }

  return { action, rationale, framing, flags: f }
}

// Full scorecard for one symbol.
// closes: array of daily close prices, oldest -> newest.
// macroScore: -2..+2 Macro-Sentiment pillar, shared across all symbols in a session (or null).
// holding: true | false | null (null = treated as flat/entry framing).
export function scoreSymbol(closes, { symbol = null, macroScore = null, holding = null, slopeLookback = 5 } = {}) {
  const ind = I.compute(closes, slopeLookback)
  const t = scoreTrend(ind)
  const m = scoreMomentum(ind)
  const dec = decide(ind, t.score, m.score, macroScore, holding)
  const pillarTotal = t.score + m.score + (macroScore ?? 0)
  return {
    symbol,
    n_bars: ind.n_bars,
    warning: ind.warning,
    pillars: {
      trend: t,
      momentum: m,
      macro_sentiment: { score: macroScore, detail: 'shared macro regime score' },
    },
    pillar_total: pillarTotal,
    decision: dec,
    indicators: ind,
  }
}
