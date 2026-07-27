import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabaseClient'
import NbscLogo from '../assets/Nbsc-logo.png'
import '../styles/Login.css'

/* ── Icons ─────────────────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function EyeIcon({ open }) {
  return open ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

/* ── Alert banner (error / success / info) ──────────────────────────────── */
// type: 'error' | 'success' | 'info'
function Alert({ type, message, onClose }) {
  // auto-dismiss success & info after 5 s
  useEffect(() => {
    if (type !== 'error') {
      const t = setTimeout(onClose, 5000)
      return () => clearTimeout(t)
    }
  }, [type, message, onClose])

  if (!message) return null

  const icons = {
    error:   '✕',
    success: '✓',
    info:    'ℹ',
  }

  return (
    <div className={`alert alert--${type}`} role="alert">
      <span className="alert__icon">{icons[type]}</span>
      <span className="alert__msg">{message}</span>
      <button type="button" className="alert__close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  )
}

/* ── Login page ─────────────────────────────────────────────────────────── */
function Login() {
  // 'signin' | 'signup' | 'confirm' | 'forgot' | 'forgot-sent'
  const [mode, setMode] = useState('signin')

  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirmPw, setConfirmPw]     = useState('')
  const [showPass, setShowPass]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]         = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  // alert state
  const [alert, setAlert] = useState(null) // { type, message }

  const showAlert = (type, message) => setAlert({ type, message })
  const clearAlert = () => setAlert(null)

  const resetTo = (nextMode) => {
    clearAlert()
    setPassword('')
    setConfirmPw('')
    setShowPass(false)
    setShowConfirm(false)
    setMode(nextMode)
  }

  const validateEmail = (val = email) => {
    if (!val.endsWith('@nbsc.edu.ph')) {
      showAlert('error', 'Only @nbsc.edu.ph email addresses are allowed.')
      return false
    }
    return true
  }

  /* ── Google OAuth ────────────────────────────────────────────────────── */
  const handleGoogleLogin = async () => {
    setOauthLoading(true)
    clearAlert()
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          queryParams: { prompt: 'select_account' }
        }
      })
      if (error) throw error
    } catch (err) {
      const msg = err.message || 'Failed to login with Google.'
      showAlert('error',
        msg.includes('block') || msg.includes('popup') || msg.includes('ERR_BLOCKED')
          ? 'Login was blocked by a browser extension. Please disable it and try again.'
          : msg
      )
      setOauthLoading(false)
    }
  }

  /* ── Email sign in ───────────────────────────────────────────────────── */
  const handleSignIn = async (e) => {
    e.preventDefault()
    clearAlert()
    if (!validateEmail()) return
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      console.log('[SignIn] data:', JSON.stringify(data))
      console.log('[SignIn] error:', error)

      if (error) throw error

      if (!data.session) {
        showAlert('error', 'Sign in succeeded but no session was returned. Your email may not be confirmed yet — check your inbox.')
        setLoading(false)
        return
      }

      showAlert('success', 'Signed in successfully! Redirecting…')
      // onAuthStateChange in App.jsx handles the redirect
    } catch (err) {
      let msg = err.message || 'Invalid email or password.'
      if (msg.toLowerCase().includes('invalid login credentials'))
        msg = 'Incorrect email or password. If you just signed up, confirm your email first.'
      else if (msg.toLowerCase().includes('email not confirmed'))
        msg = 'Please click the confirmation link in your inbox before signing in.'
      showAlert('error', msg)
      setLoading(false)
    }
  }

  /* ── Sign up ─────────────────────────────────────────────────────────── */
  const handleSignUp = async (e) => {
    e.preventDefault()
    clearAlert()
    if (!validateEmail()) return
    if (password.length < 8) { showAlert('error', 'Password must be at least 8 characters.'); return }
    if (password !== confirmPw) { showAlert('error', 'Passwords do not match.'); return }
    setLoading(true)
    try {
      console.log('[SignUp] attempting with:', email)
      const { data, error } = await supabase.auth.signUp({ email, password })
      console.log('[SignUp] data:', JSON.stringify(data))
      console.log('[SignUp] error:', JSON.stringify(error))

      if (error) throw error

      if (data?.user && data.user.identities?.length === 0) {
        showAlert('info', `An account for ${email} already exists. Try signing in.`)
        setLoading(false)
        return
      }

      if (data?.session) {
        // Confirmation off — immediately signed in
        showAlert('success', 'Account created! Signing you in…')
        // App.jsx onAuthStateChange handles redirect
      } else if (data?.user) {
        // Confirmation on — need to verify email
        showAlert('success', `Check ${email} for a confirmation link.`)
        setMode('confirm')
      } else {
        showAlert('error', 'Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('[SignUp] caught error:', err)
      let msg = err.message || 'Could not create account. Please try again.'
      if (err.status === 500 || msg.includes('500')) {
        msg = 'Server error — try disabling "Confirm email" in Supabase Auth settings, or check your Supabase project status.'
      }
      showAlert('error', msg)
    }
    setLoading(false)
  }

  /* ── Forgot password ─────────────────────────────────────────────────── */
  const handleForgot = async (e) => {
    e.preventDefault()
    clearAlert()
    if (!validateEmail()) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`
      })
      if (error) throw error
      showAlert('success', `Reset link sent to ${email}.`)
      setMode('forgot-sent')
    } catch (err) {
      showAlert('error', err.message || 'Could not send reset email.')
      setLoading(false)
    }
  }

  /* ── Info screens (confirm / forgot-sent) ────────────────────────────── */
  if (mode === 'confirm' || mode === 'forgot-sent') {
    const isConfirm = mode === 'confirm'
    return (
      <div className="login">
        {alert && <Alert {...alert} onClose={clearAlert} />}
        <div className="login__card login__card--centered">
          <div className="login__confirm-icon">{isConfirm ? '📬' : '🔑'}</div>
          <h2 className="login__title">{isConfirm ? 'Check your email' : 'Reset link sent'}</h2>
          <p className="login__subtitle">
            {isConfirm
              ? <><strong>{email}</strong> — click the confirmation link to activate your account, then sign in.</>
              : <><strong>{email}</strong> — click the reset link to set a new password.</>}
          </p>
          <button type="button" className="login__link-btn" onClick={() => resetTo('signin')}>
            ← Back to sign in
          </button>
        </div>
        <p className="login__footer-text">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    )
  }

  const isSignUp = mode === 'signup'
  const isForgot = mode === 'forgot'

  return (
    <div className="login">
      {/* ── Toast alert ── */}
      {alert && <Alert {...alert} onClose={clearAlert} />}

      <div className="login__card">

        {/* Header */}
        <div className="login__header">
          <img src={NbscLogo} alt="NBSC Logo" className="login__logo-image" />
          <h1 className="login__title">Student Portal</h1>
          <p className="login__subtitle">
            {isForgot
              ? 'Enter your email to receive a reset link.'
              : isSignUp
              ? 'Create your @nbsc.edu.ph account.'
              : 'Sign in to access your student portal.'}
          </p>
        </div>

        {/* Google button */}
        {!isForgot && (
          <>
            <button
              type="button"
              className="login__google-btn"
              onClick={handleGoogleLogin}
              disabled={oauthLoading}
            >
              <GoogleIcon />
              <span>{oauthLoading ? 'Redirecting…' : 'Continue with Google'}</span>
            </button>

            <div className="login__divider">
              <span>or continue with email</span>
            </div>
          </>
        )}

        {/* Form */}
        <form
          className="login__form"
          onSubmit={isForgot ? handleForgot : isSignUp ? handleSignUp : handleSignIn}
          noValidate
        >
          <div className="login__field">
            <label className="login__label" htmlFor="lf-email">Email address</label>
            <input
              id="lf-email"
              type="email"
              className="login__input"
              placeholder="you@nbsc.edu.ph"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {!isForgot && (
            <div className="login__field">
              <div className="login__label-row">
                <label className="login__label" htmlFor="lf-password">Password</label>
                {!isSignUp && (
                  <button type="button" className="login__link-btn login__link-btn--sm"
                    onClick={() => resetTo('forgot')}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="login__input-wrap">
                <input
                  id="lf-password"
                  type={showPass ? 'text' : 'password'}
                  className="login__input login__input--pass"
                  placeholder={isSignUp ? 'Min. 8 characters' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                />
                <button type="button" className="login__eye"
                  onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}>
                  <EyeIcon open={showPass} />
                </button>
              </div>
            </div>
          )}

          {isSignUp && (
            <div className="login__field">
              <label className="login__label" htmlFor="lf-confirm">Confirm password</label>
              <div className="login__input-wrap">
                <input
                  id="lf-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  className="login__input login__input--pass"
                  placeholder="Repeat your password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button type="button" className="login__eye"
                  onClick={() => setShowConfirm(v => !v)}
                  aria-label={showConfirm ? 'Hide' : 'Show'}>
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
            </div>
          )}

          <button type="submit" className="login__submit-btn" disabled={loading}>
            {loading
              ? (isForgot ? 'Sending…' : isSignUp ? 'Creating account…' : 'Signing in…')
              : (isForgot ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in')}
          </button>
        </form>

        {/* Mode toggle */}
        <p className="login__toggle-text">
          {isForgot ? (
            <button type="button" className="login__link-btn" onClick={() => resetTo('signin')}>
              ← Back to sign in
            </button>
          ) : isSignUp ? (
            <>Already have an account?{' '}
              <button type="button" className="login__link-btn" onClick={() => resetTo('signin')}>Sign in</button>
            </>
          ) : (
            <>Don't have an account?{' '}
              <button type="button" className="login__link-btn" onClick={() => resetTo('signup')}>Create one</button>
            </>
          )}
        </p>

      </div>

      <p className="login__footer-text">
        By signing in, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  )
}

export default Login
