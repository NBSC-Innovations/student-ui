import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

/* ── Types: 'success' | 'error' | 'info' ── */

const ToastContext = createContext(null)

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((type, message, duration = 3500) => {
    const id = ++_id
    setToasts(prev => [...prev, { id, type, message, duration }])
    return id
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = {
    success: (msg, ms) => push('success', msg, ms),
    error:   (msg, ms) => push('error',   msg, ms ?? 5000),
    info:    (msg, ms) => push('info',    msg, ms),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

/* ── Single toast item ── */
function ToastItem({ id, type, message, duration, onDismiss }) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  // Slide in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // Auto-dismiss
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(id), 300)
    }, duration)
    return () => clearTimeout(timerRef.current)
  }, [id, duration, onDismiss])

  const handleClose = () => {
    clearTimeout(timerRef.current)
    setVisible(false)
    setTimeout(() => onDismiss(id), 300)
  }

  const icons = {
    success: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    error: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    info: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  }

  return (
    <div
      className={`toast toast--${type} ${visible ? 'toast--visible' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <span className="toast__icon">{icons[type]}</span>
      <span className="toast__msg">{message}</span>
      <button
        type="button"
        className="toast__close"
        onClick={handleClose}
        aria-label="Dismiss"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

/* ── Toast stack ── */
function ToastList({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-list" aria-label="Notifications">
      {toasts.map(t => (
        <ToastItem key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
