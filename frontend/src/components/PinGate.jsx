/**
 * PinGate — Sign In / Sign Up screen.
 *
 * Sign In: enter PIN only -> lookup user by PIN
 * Sign Up: enter name + PIN -> create user
 * Supports both numpad clicks and keyboard typing.
 */

import { useState, useEffect, useRef } from 'react'

const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function storeAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function validateStoredToken() {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const user = await res.json();
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return true;
    }
    clearAuth();
    return false;
  } catch {
    return !!getToken();
  }
}

export default function PinGate({ onSuccess }) {
  const [mode, setMode] = useState('signin')
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [staySignedIn, setStaySignedIn] = useState(true)
  const screenRef = useRef(null)
  const nameRef = useRef(null)

  useEffect(() => {
    if (mode === 'signup') {
      nameRef.current?.focus()
    } else {
      screenRef.current?.focus()
    }
  }, [mode])

  const handleSubmit = async () => {
    if (pin.length < 4) { setError('Enter at least 4 digits'); return }
    if (mode === 'signup' && !name.trim()) { setError('Enter your name'); return }

    setLoading(true)
    setError('')
    try {
      const url = mode === 'signup' ? `${BASE}/auth/signup` : `${BASE}/auth/signin`
      const body = mode === 'signup'
        ? { name: name.trim(), pin, stay_signed_in: staySignedIn }
        : { pin, stay_signed_in: staySignedIn }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        storeAuth(data.token, data.user)
        onSuccess()
      } else {
        const err = await res.json().catch(() => ({}))
        setError(err.detail || 'Something went wrong')
        setPin('')
      }
    } catch {
      setError('Network error — try again')
    }
    setLoading(false)
  }

  const handleDigit = (d) => {
    if (pin.length >= 8) return
    setPin(p => p + d)
    setError('')
  }

  const handleDelete = () => {
    setPin(p => p.slice(0, -1))
    setError('')
  }

  const handleKeyDown = (e) => {
    if (e.target.tagName === 'INPUT') return
    if (e.key === 'Enter') handleSubmit()
    else if (e.key === 'Backspace') handleDelete()
    else if (/^\d$/.test(e.key)) handleDigit(e.key)
  }

  const switchMode = () => {
    setMode(m => m === 'signin' ? 'signup' : 'signin')
    setPin('')
    setName('')
    setError('')
  }

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del']

  return (
    <div className="pin-screen" onKeyDown={handleKeyDown} tabIndex={0} ref={screenRef}>
      <div className="pin-card">
        <div className="pin-logo">
          <svg viewBox="0 0 64 64" fill="none">
            <rect x="4" y="4" width="56" height="56" rx="16" fill="#17472a" />
            <path d="M14 42 L24 22 L32 34 L42 18 L50 42"
              stroke="#8edba8" strokeWidth="3.5"
              fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="pin-title">Consistency Dashboard</h2>
        <p className="pin-subtitle">
          {mode === 'signin' ? 'Enter your PIN to sign in' : 'Create your account'}
        </p>

        {mode === 'signup' && (
          <input
            ref={nameRef}
            className="pin-name-input"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            maxLength={50}
          />
        )}

        <div className="pin-dots">
          {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => (
            <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>
        <p className="pin-hint">{pin.length > 0 ? `${pin.length} digits` : 'Type or tap digits'}</p>

        {error && <p className="pin-error">{error}</p>}

        <div className="pin-keypad">
          {digits.map((d, i) => {
            if (d === null) return <div key={i} className="pin-key empty" />
            if (d === 'del') {
              return (
                <button key={i} className="pin-key" onClick={handleDelete} type="button">←</button>
              )
            }
            return (
              <button key={i} className="pin-key" onClick={() => handleDigit(String(d))} type="button">{d}</button>
            )
          })}
        </div>

        <label className="stay-signed-in">
          <input type="checkbox" checked={staySignedIn} onChange={e => setStaySignedIn(e.target.checked)} />
          <span>Stay signed in (30 days)</span>
        </label>

        <button
          className="pin-submit"
          onClick={handleSubmit}
          disabled={loading || pin.length < 4 || (mode === 'signup' && !name.trim())}
          type="button"
        >
          {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
        </button>

        <p className="pin-switch">
          {mode === 'signin' ? (
            <>New here? <button type="button" className="pin-switch-btn" onClick={switchMode}>Sign up</button></>
          ) : (
            <>Have a PIN? <button type="button" className="pin-switch-btn" onClick={switchMode}>Sign in</button></>
          )}
        </p>
      </div>
    </div>
  )
}
