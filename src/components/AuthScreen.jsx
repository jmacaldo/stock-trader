import { useState } from 'react'
import { supabase } from '../supabase'

const ERRORS = {
  'Invalid login credentials': 'Invalid email or password.',
  'User already registered': 'An account with this email already exists.',
  'Email not confirmed': 'Please confirm your email before signing in.',
}

function friendlyError(msg) {
  return ERRORS[msg] ?? msg
}

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const switchMode = (m) => { setMode(m); setError(null); setNotice(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onAuth(data.user.id)
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) {
          onAuth(data.user.id)
        } else {
          setNotice('Account created! Check your email for a confirmation link, then sign in.')
          switchMode('signin')
        }
      }
    } catch (err) {
      setError(friendlyError(err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) { setError('Enter your email address above first.'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (error) setError(error.message)
    else setNotice('Password reset email sent — check your inbox.')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-base">P</div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-none">PaperTrade</h1>
            <p className="text-xs text-gray-500 mt-0.5">Paper Trading Simulator</p>
          </div>
        </div>

        <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 mb-6">
          {[['signin', 'Sign In'], ['signup', 'Create Account']].map(([m, label]) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                mode === m
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {notice && (
          <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/40 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 mb-4">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" minLength={6} />
          {mode === 'signup' && (
            <Field label="Confirm Password" type="password" value={confirm} onChange={setConfirm} placeholder="••••••••" />
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold text-sm transition-colors"
          >
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>

          {mode === 'signin' && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors py-1"
            >
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

function Field({ label, type, value, onChange, placeholder, minLength }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">{label}</label>
      <input
        type={type}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'off'}
        className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-400 dark:placeholder-gray-500"
      />
    </div>
  )
}
