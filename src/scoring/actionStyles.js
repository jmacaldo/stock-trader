// Shared badge styling/labeling for decision.action strings produced by score.js.
export function actionShortLabel(action) {
  if (action === 'WAIT_FOR_PULLBACK') return 'WAIT (pullback)'
  return action.split(' (')[0].replace(' / ', '/')
}

const DESCRIPTIVE_ACTIONS = new Set(['EXIT / TRIM', 'WAIT_FOR_PULLBACK'])

// The exhaustion-driven verdicts (EXIT/TRIM held, WAIT_FOR_PULLBACK flat) are
// built on an unvalidated pillar (see score.js's header comment) — badges for
// these show the descriptive condition (decision.rationale, e.g. "Extended:
// 12% above EMA20, at upper band") instead of an imperative verb, so the UI
// doesn't assert an action the data doesn't back up. Everything else keeps
// the short action label as before.
export function badgeLabel(decision) {
  if (DESCRIPTIVE_ACTIONS.has(decision.action)) return decision.rationale
  return actionShortLabel(decision.action)
}

const NEUTRAL = 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'

const STYLE_RULES = [
  [/^EXIT/, 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'],
  [/^RE-ENTRY/, 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'],
  [/^TACTICAL/, 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'],
  [/^STAY OUT/, 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'],
  [/^HOLD/, 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'],
  // Neutral and explicitly distinct from RE-ENTRY: an extended/exhausted
  // rebound, not a clean entry trigger.
  [/^WAIT_FOR_PULLBACK/, NEUTRAL],
]

export function actionStyle(action) {
  const hit = STYLE_RULES.find(([re]) => re.test(action))
  return hit ? hit[1] : NEUTRAL
}

// Semicolon-joined per-category flag lines for a decision, e.g.
// "Exhaustion: price stretched 12% above EMA20; price at/above upper
// Bollinger Band (%B≥1)" — used to surface the specific flags behind a
// verdict on compact badges.
export function flagLines(decision) {
  const { exhaustion, bearish, rebound } = decision.flags
  const lines = []
  if (exhaustion.length) lines.push(`Exhaustion: ${exhaustion.join('; ')}`)
  if (bearish.length) lines.push(`Bearish: ${bearish.join('; ')}`)
  if (rebound.length) lines.push(`Rebound: ${rebound.join('; ')}`)
  return lines
}

export function pillarColor(score) {
  if (score == null) return 'text-gray-400 dark:text-gray-600'
  if (score > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (score < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-500 dark:text-gray-400'
}
