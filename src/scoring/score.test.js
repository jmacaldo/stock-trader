import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeFlags, decide } from './score.js'

// Hand-built indicator object so each test controls exactly which flags fire,
// independent of the indicator-computation layer (already verified against
// the Python reference separately).
function baseInd(overrides = {}) {
  return {
    close: 100,
    ema20: 100, ema50: 98, ema200: 95,
    ema20_slope: 0.1, ema50_slope: 0.1, ema200_slope: 0.1,
    rsi14: 50, rsi14_prev: 50,
    macd_line: 0.1, macd_signal: 0.05,
    macd_hist: 0.05, macd_hist_prev: 0.03,
    trix: 0.01, trix_prev: 0.01,
    trix_signal: 0.02, trix_signal_prev: 0.02,
    bars_since_below_ema20: null,
    bb_mid: 99, bb_upper: 105, bb_lower: 93, percent_b: 0.6,
    ...overrides,
  }
}

// An extended rebound: reclaims EMA20 + fresh TRIX cross (2 rebound flags),
// RSI turning down from overbought + %B at upper band (2 exhaustion flags).
// This is the HOOD-shaped case from the original bug report.
function extendedReboundInd() {
  return baseInd({
    close: 112, ema20: 100, ema20_slope: 0.5,
    bars_since_below_ema20: 2,
    trix: -0.01, trix_signal: -0.03, trix_prev: -0.1, trix_signal_prev: -0.05,
    rsi14: 71, rsi14_prev: 75,
    percent_b: 1.05,
  })
}

test('flat + exhausted -> WAIT_FOR_PULLBACK, not RE-ENTRY', () => {
  const ind = extendedReboundInd()
  const flags = computeFlags(ind)
  assert.ok(flags.rebound.length >= 2, 'sanity: rebound alone would have qualified for RE-ENTRY')
  assert.ok(flags.exhaustion.length >= 2, 'sanity: exhaustion trips the threshold')

  const d = decide(ind, 2, 2, null, null)
  assert.equal(d.action, 'WAIT_FOR_PULLBACK')
  assert.match(d.rationale, /^Extended:/, 'exhaustion verdicts describe the condition, not an imperative')
})

test('held + exhausted -> EXIT / TRIM (unchanged)', () => {
  const ind = extendedReboundInd()
  const d = decide(ind, 2, 2, null, true)
  assert.equal(d.action, 'EXIT / TRIM')
  assert.match(d.rationale, /^Extended:/)
})

test('flat + rebound + clean (not exhausted) -> RE-ENTRY (unchanged)', () => {
  const ind = baseInd({
    close: 103, ema20: 100, ema20_slope: 0.5,
    bars_since_below_ema20: 2,
    trix: -0.01, trix_signal: -0.03, trix_prev: -0.1, trix_signal_prev: -0.05,
    rsi14: 55, rsi14_prev: 50,
    percent_b: 0.6,
    macd_hist: 0.06, macd_hist_prev: 0.05,
  })
  const flags = computeFlags(ind)
  assert.equal(flags.exhaustion.length, 0)
  assert.ok(flags.rebound.length >= 2)
  assert.equal(flags.death_cross, false)

  const d = decide(ind, 2, 1, null, null)
  assert.equal(d.action, 'RE-ENTRY (new cycle)')
})

// %B and stretch were briefly collapsed into one "EXTENSION" flag on the
// theory they were collinear; that was measured (19.5% Jaccard) and found
// false, so they're back to independently-counted flags. These two tests are
// the regression guard against re-merging them without re-measuring.
test('%B and stretch are independent flags: only one firing does not alone trip exhaustion', () => {
  const ind = baseInd({
    close: 101, ema20: 100,                 // stretch = 1%, below the 10% threshold
    percent_b: 1.02,                        // %B threshold true
    macd_hist: 0.06, macd_hist_prev: 0.05,  // not shrinking
  })
  const flags = computeFlags(ind)
  assert.equal(flags.exhaustion.length, 1)
  assert.match(flags.exhaustion[0], /Bollinger/)

  const d = decide(ind, 0, 0, null, null)
  assert.notEqual(d.action, 'WAIT_FOR_PULLBACK')
  assert.notEqual(d.action, 'EXIT / TRIM')
})

test('%B and stretch both firing counts as two independent flags', () => {
  const ind = baseInd({
    close: 112, ema20: 100,   // stretch = 12%, above the 10% threshold
    percent_b: 1.05,          // %B threshold also true
    macd_hist: 0.06, macd_hist_prev: 0.05,
  })
  const flags = computeFlags(ind)
  assert.equal(flags.exhaustion.length, 2)
  assert.ok(flags.exhaustion.some((f) => f.includes('Bollinger')))
  assert.ok(flags.exhaustion.some((f) => f.includes('stretched')))

  const d = decide(ind, 0, 0, null, true)
  assert.equal(d.action, 'EXIT / TRIM', 'two independent flags should trip the held threshold')
})

// RSI-turn and MACD-shrink are no longer down-weighted against each other —
// that fix was removed (dead on the Market Movers path, <1.5% effect
// elsewhere) — so both firing together should count as two flags, same as
// any other pair.
test('RSI-turn and MACD-shrink both count when they co-occur', () => {
  const ind = baseInd({
    rsi14: 71, rsi14_prev: 75,               // RSI-turn fires
    macd_hist: 0.05, macd_hist_prev: 0.08,   // MACD-shrink also fires
    percent_b: 0.6,
  })
  const flags = computeFlags(ind)
  assert.equal(flags.exhaustion.length, 2)

  const d = decide(ind, 0, 0, null, true)
  assert.equal(d.action, 'EXIT / TRIM')
})
