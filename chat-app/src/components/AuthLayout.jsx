import { useCallback, useState } from 'react'
import { supabase } from '../services/supabaseClient'

const initialState = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  acceptTerms: false,
  acceptPrivacy: false,
  acceptCookies: false,
}

const validateEmail = (value) => /.+@.+\..+/.test(value)

// Background decorativo per auth
const AuthBackground = () => (
  <div 
    className="absolute inset-0 -z-10 overflow-hidden"
    style={{
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 1) 0%, rgba(248, 250, 252, 0.5) 50%, rgba(255, 255, 255, 1) 100%)'
    }}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50/30 to-white" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(47,154,167,0.06),transparent_50%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_50%,rgba(62,184,168,0.04),transparent_50%)]" />
    <svg className="absolute inset-0 h-full w-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="auth-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="currentColor" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#auth-grid)" />
    </svg>
  </div>
)

export default function AuthLayout({ onBack }) {
  const [mode, setMode] = useState('signin')
  const [formValues, setFormValues] = useState(initialState)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleChange = useCallback((field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }))
  }, [])

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'))
    setFormValues(initialState)
    setError(null)
    setMessage(null)
  }, [])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      if (isSubmitting) return
      setError(null)
      setMessage(null)

      const email = formValues.email.trim()
      const password = formValues.password.trim()
      const firstName = formValues.firstName.trim()
      const lastName = formValues.lastName.trim()
      const acceptTerms = formValues.acceptTerms
      const acceptPrivacy = formValues.acceptPrivacy
      const acceptCookies = formValues.acceptCookies

      if (!validateEmail(email)) {
        setError('Inserisci un indirizzo email valido.')
        return
      }

      if (password.length < 8) {
        setError('La password deve contenere almeno 8 caratteri.')
        return
      }

      if (mode === 'signup' && (!firstName || !lastName)) {
        setError('Inserisci sia il nome sia il cognome.')
        return
      }

      if (mode === 'signup' && (!acceptTerms || !acceptPrivacy || !acceptCookies)) {
        setError('Per procedere accetta Termini, Privacy e uso dei cookie.')
        return
      }

      setIsSubmitting(true)
      try {
        if (mode === 'signin') {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
          if (signInError) {
            throw signInError
          }
        } else {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                first_name: firstName,
                last_name: lastName,
                accepted_terms_at: new Date().toISOString(),
                accept_terms: acceptTerms,
                accept_privacy: acceptPrivacy,
                accept_cookies: acceptCookies,
              },
            },
          })

          if (signUpError) {
            throw signUpError
          }

          if (signUpData?.user) {
            // Invia email di benvenuto tramite backend
            try {
              await fetch('/api/email/welcome', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: email, firstName }),
              })
            } catch (e) { /* non bloccante */ }
            setMessage('Registrazione completata! Controlla la tua casella email.')
          } else {
            setMessage('Registrazione completata! Controlla la tua casella email.')
          }
        }
      } catch (submitError) {
        setError(submitError.message ?? 'Impossibile completare la richiesta. Riprova più tardi.')
      } finally {
        setIsSubmitting(false)
      }
    },
    [formValues, isSubmitting, mode],
  )

  return (
    <div 
      className="relative flex min-h-screen items-center justify-center px-4 py-12"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 1)',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 1) 0%, rgba(248, 250, 252, 0.5) 50%, rgba(255, 255, 255, 1) 100%)'
      }}
    >
      <AuthBackground />
      
      {/* Pulsante Indietro in alto a sinistra della schermata */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="fixed left-6 top-6 z-50 inline-flex items-center gap-2 rounded-xl border border-[#7B1F34] bg-gradient-to-r from-[#7B1F34] to-[#9E3A50] px-4 py-2 text-sm font-medium text-white shadow-sm shadow-[#7B1F34]/30 transition-all hover:shadow-md hover:shadow-[#7B1F34]/40 hover:scale-105"
          disabled={isSubmitting}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Indietro
        </button>
      )}
      
      <div className="relative w-full max-w-md">
        {/* Card principale con glassmorphism */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/50 bg-white/90 p-10 shadow-2xl backdrop-blur-sm">
          {/* Decorative gradient overlay */}
          <div className="absolute right-0 top-0 h-64 w-64 bg-gradient-to-br from-[#7B1F34]/5 to-transparent blur-3xl" />
          
          {/* Logo e header migliorati */}
          <div className="relative mb-8 flex flex-col items-center">
            <div className="mb-4 flex items-center gap-3">
              <span className="text-2xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em', fontSize: '40px', fontWeight: '900' }}>{mode === 'signin' ? 'Accedi' : 'Registrati'}</span>
            </div>
            <p className="mt-3 text-center text-slate-600">
              {mode === 'signin'
                ? 'Accedi per continuare a lavorare con i tuoi documenti'
                : 'Inizia subito a trasformare il tuo lavoro'}
            </p>
          </div>

          <form className="relative space-y-5" onSubmit={handleSubmit}>
            {mode === 'signup' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-2 block text-sm font-medium text-slate-700">
                    Nome
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-[#7B1F34] focus:ring-2 focus:ring-[#7B1F34]/20"
                    placeholder="Mario"
                    value={formValues.firstName}
                    onChange={(event) => handleChange('firstName', event.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="mb-2 block text-sm font-medium text-slate-700">
                    Cognome
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-[#7B1F34] focus:ring-2 focus:ring-[#7B1F34]/20"
                    placeholder="Rossi"
                    value={formValues.lastName}
                    onChange={(event) => handleChange('lastName', event.target.value)}
                    disabled={isSubmitting}
                    required
                  />
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-[#7B1F34] focus:ring-2 focus:ring-[#7B1F34]/20"
                placeholder="nome@esempio.com"
                value={formValues.email}
                onChange={(event) => handleChange('email', event.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition-all focus:border-[#7B1F34] focus:ring-2 focus:ring-[#7B1F34]/20"
                  placeholder="Almeno 8 caratteri"
                  value={formValues.password}
                  onChange={(event) => handleChange('password', event.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {mode === 'signup' ? (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-4 text-sm text-slate-600">
                <label className="flex items-start gap-3 text-left">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-[#7B1F34] focus:ring-[#7B1F34]"
                    checked={formValues.acceptTerms}
                    onChange={(event) => handleChange('acceptTerms', event.target.checked)}
                    disabled={isSubmitting}
                    required
                  />
                  <span>
                    Accetto i{' '}
                    <a href="/termini-e-condizioni" className="font-semibold text-[#7B1F34] underline-offset-4 hover:text-[#21707a] transition" target="_blank" rel="noreferrer">
                      Termini e condizioni d'uso
                    </a>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-left">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-[#7B1F34] focus:ring-[#7B1F34]"
                    checked={formValues.acceptPrivacy}
                    onChange={(event) => handleChange('acceptPrivacy', event.target.checked)}
                    disabled={isSubmitting}
                    required
                  />
                  <span>
                    Confermo di aver letto la{' '}
                    <a href="/privacy-policy" className="font-semibold text-[#7B1F34] underline-offset-4 hover:text-[#21707a] transition" target="_blank" rel="noreferrer">
                      Privacy Policy
                    </a>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-left">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-[#7B1F34] focus:ring-[#7B1F34]"
                    checked={formValues.acceptCookies}
                    onChange={(event) => handleChange('acceptCookies', event.target.checked)}
                    disabled={isSubmitting}
                    required
                  />
                  <span>
                    Accetto l'utilizzo dei cookie secondo la{' '}
                    <a href="/cookie-policy" className="font-semibold text-[#7B1F34] underline-offset-4 hover:text-[#21707a] transition" target="_blank" rel="noreferrer">
                      Cookie Policy
                    </a>
                  </span>
                </label>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
              </div>
            ) : null}

            {message ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <div className="flex items-start gap-2">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{message}</span>
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-[#7B1F34] to-[#9E3A50] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#7B1F34]/30 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[#7B1F34]/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7B1F34] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              <span className="relative z-10">
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Attendi...
                  </span>
                ) : (
                  mode === 'signin' ? 'Accedi' : 'Crea Account'
                )}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-[#9E3A50] to-[#7B1F34] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </form>

          <div className="mt-8 border-t border-slate-200/50 pt-6 text-center text-sm text-slate-600">
            {mode === 'signin' ? 'Non hai un account?' : 'Hai già un account?'}{' '}
            <button
              type="button"
              className="font-semibold text-[#7B1F34] underline-offset-4 transition hover:text-[#21707a]"
              onClick={toggleMode}
              disabled={isSubmitting}
            >
              {mode === 'signin' ? 'Registrati' : 'Accedi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
