import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabaseClient'
import { useToast } from '../utils/toast.jsx'
import NbscLogo from '../assets/Nbsc-logo.png'
import '../styles/Login.css'

/* ── Icons ─────────────────────────────────────────────────────────────── */
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
  // 'signin' | 'signup' | 'forgot' | 'forgot-sent'
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [alert, setAlert] = useState(null)
  const toast = useToast()

  const showAlert = (type, message) => setAlert({ type, message })
  const clearAlert = () => setAlert(null)

  /* ── Google sign in ───────────────────────────────────────────────────── */
  const handleGoogleSignIn = async () => {
    clearAlert()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
          skipBrowserRedirect: false
        }
      })
      if (error) throw error
      // OAuth redirect happens automatically
    } catch (err) {
      showAlert('error', err.message || 'Could not sign in with Google.')
      setLoading(false)
    }
  }

  const resetTo = (nextMode) => {
    clearAlert()
    setEmailError('')
    setPassword('')
    setShowPass(false)
    setMode(nextMode)
  }

  // Clears field error as user types a valid domain
  const handleEmailChange = (val) => {
    setEmail(val)
    if (emailError && val.endsWith('@nbsc.edu.ph')) {
      setEmailError('')
    }
  }

  const validateEmail = (val = email) => {
    if (!val.trim()) {
      setEmailError('Email address is required.')
      return false
    }
    if (!val.endsWith('@nbsc.edu.ph')) {
      setEmailError('Only @nbsc.edu.ph email addresses are allowed.')
      return false
    }
    const localPart = val.split('@')[0]
    if (!/^\d+$/.test(localPart)) {
      setEmailError('Only numeric email addresses are allowed (e.g., 12345678@nbsc.edu.ph).')
      return false
    }
    setEmailError('')
    return true
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

      // Check if email is verified
      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut()
        showAlert('error', 'Please confirm your email first. Check your inbox for the confirmation link.')
        setLoading(false)
        return
      }

      showAlert('success', 'Signed in successfully! Redirecting…')
      // onAuthStateChange in App.jsx handles the redirect
    } catch (err) {
      let msg = err.message || 'Invalid email or password.'
      
      if (msg.toLowerCase().includes('invalid login credentials')) {
        msg = 'This account uses Google sign-in. Please use "Sign in with Google" button below.'
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        msg = 'Please confirm your email first. Check your inbox for the confirmation link.'
      } else if (msg.toLowerCase().includes('user not found')) {
        msg = 'Account not found. Please sign up first.'
      }
      
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
    setLoading(true)
    try {
      console.log('[SignUp] attempting with:', email)
      
      const { data, error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      })
      console.log('[SignUp] data:', JSON.stringify(data))
      console.log('[SignUp] error:', JSON.stringify(error))

      if (error) throw error

      if (data?.user && data.user.identities?.length === 0) {
        // User already exists - check if they have Google
        showAlert('info', `An account for ${email} already exists. If you signed up with Google, please sign in with Google first, then add a password in your Profile.`)
        setLoading(false)
        return
      }

      if (data?.user) {
        // Profile is created automatically by the database trigger
      }

      if (data?.session) {
        // Email confirmation off - immediately signed in
        showAlert('success', 'Account created! Signing you in…')
        toast.success('Account created successfully!')
        // App.jsx onAuthStateChange handles redirect
      } else if (data?.user) {
        // Email confirmation on - need to verify email
        showAlert('success', `Check ${email} for a confirmation link to activate your account.`)
        toast.success('Confirmation email sent!')
      }
    } catch (err) {
      console.error('[SignUp] error:', err)
      let msg = err.message || 'Failed to create account.'
      if (msg.toLowerCase().includes('user already registered')) {
        msg = 'An account with this email already exists. If you signed up with Google, please sign in with Google first, then add a password in your Profile.'
      }
      showAlert('error', msg)
    } finally {
      setLoading(false)
    }
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

  /* ── Info screens (forgot-sent) ───────────────────────────────────────── */
  if (mode === 'forgot-sent') {
    return (
      <div className="login">
        {alert && <Alert {...alert} onClose={clearAlert} />}
        <div className="login__card login__card--centered">
          <div className="login__confirm-icon">🔑</div>
          <h2 className="login__title">Reset link sent</h2>
          <p className="login__subtitle">
            <><strong>{email}</strong> — click the reset link to set a new password.</>
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
              className={`login__input ${emailError ? 'login__input--error' : ''}`}
              placeholder="you@nbsc.edu.ph"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              required
              autoComplete="email"
            />
            {emailError && (
              <span className="login__field-error">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {emailError}
              </span>
            )}
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


          <button type="submit" className="login__submit-btn" disabled={loading}>
            {loading
              ? (isForgot ? 'Sending…' : isSignUp ? 'Creating account…' : 'Logging in…')
              : (isForgot ? 'Send reset link' : isSignUp ? 'Create account' : 'Login')}
          </button>

          {!isForgot && (
            <div className="login__divider">
              <span className="login__divider-text">or</span>
            </div>
          )}

          {!isForgot && (
            <button
              type="button"
              className="login__google-btn"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" className="login__google-icon">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {isSignUp ? 'Sign up with Google' : 'Sign in with Google'}
            </button>
          )}
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
              <button type="button" className="login__link-btn" onClick={() => resetTo('signup')}>Sign in</button>
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
