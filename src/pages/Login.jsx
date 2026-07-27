import { useState } from 'react'
import { supabase } from '../utils/supabaseClient'
import NbscLogo from '../assets/Nbsc-logo.png'
import '../styles/Login.css'

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

function Login({ onLogin }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            prompt: 'select_account'
          }
        }
      })

      if (error) {
        console.error('OAuth error:', error)
        throw error
      }
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'Failed to login with Google. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__header">
          <div className="login__logo">
            <img src={NbscLogo} alt="NBSC Logo" className="login__logo-image" />
          </div>
          <h1 className="login__title">Student Portal Login</h1>
          <p className="login__subtitle">Sign in to access your student portal</p>
        </div>

        <div className="login__body">
          {error && (
            <div className="login__error">
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            className="login__google-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            <GoogleIcon />
            <span>{loading ? 'Signing in...' : 'Continue with Google'}</span>
          </button>

          <div className="login__divider">
            <span>or continue with email</span>
          </div>

          <div className="login__info">
            <div className="login__info-item">
              <div className="login__info-icon">📧</div>
              <div className="login__info-text">
                <strong>Required:</strong> @nbsc.edu.ph email address
              </div>
            </div>
            <div className="login__info-item">
              <div className="login__info-icon">🎓</div>
              <div className="login__info-text">
                <strong>Student Portal:</strong> Access your enrolled subjects and group chats
              </div>
            </div>
          </div>
        </div>

        <div className="login__footer">
          <p className="login__footer-text">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
