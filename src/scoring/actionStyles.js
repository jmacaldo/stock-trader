// Shared badge styling/labeling for decision.action strings produced by score.js.
export function actionShortLabel(action) {
  return action.split(' (')[0].replace(' / ', '/')
}

const STYLE_RULES = [
  [/^EXIT/, 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'],
  [/^RE-ENTRY/, 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'],
  [/^TACTICAL/, 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'],
  [/^STAY OUT/, 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'],
  [/^HOLD/, 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'],
]

export function actionStyle(action) {
  const hit = STYLE_RULES.find(([re]) => re.test(action))
  return hit ? hit[1] : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
}

export function pillarColor(score) {
  if (score == null) return 'text-gray-400 dark:text-gray-600'
  if (score > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (score < 0) return 'text-red-600 dark:text-red-400'
  return 'text-gray-500 dark:text-gray-400'
}
