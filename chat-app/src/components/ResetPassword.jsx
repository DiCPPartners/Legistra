import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabaseClient'

export default function ResetPassword({ onComplete }) {
  const [isVerifying, setIsVerifying] = useState(true)
  const [error, setError] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [isPasswordDirty, setIsPasswordDirty] = useState(false)
  const passwordInputRef = useRef(null)

  useEffect(() => {
    let active = true
    const verifyFromUrl = async () => {
      try {
        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
        const hashParams = new URLSearchParams(hash)
        const searchParams = new URLSearchParams(window.location.search)

        const redirectedFromRaw = searchParams.get('redirected_from') || hashParams.get('redirected_from')
        const redirectedParams = redirectedFromRaw ? new URLSearchParams(redirectedFromRaw) : null

        const pickValue = (key) => {
          const values = []
          if (searchParams) {
            const all = searchParams.getAll(key)
            if (all?.length) values.push(...all)
          }
          if (hashParams) {
            const all = hashParams.getAll(key)
            if (all?.length) values.push(...all)
          }
          if (redirectedParams) {
            const all = redirectedParams.getAll(key)
            if (all?.length) values.push(...all)
          }
          for (let index = values.length - 1; index >= 0; index -= 1) {
            const candidate = values[index]
            if (candidate != null && `${candidate}`.trim().length > 0) {
              return candidate
            }
          }
          return null
        }

        const errorDescription = pickValue('error_description')

        const accessToken = pickValue('access_token')
        const refreshToken = pickValue('refresh_token')
        const tokenValue = pickValue('token')
        const tokenHash = pickValue('token_hash') || tokenValue
        const codeParam = pickValue('code')
        const typeParam = pickValue('type')
        const emailParam = pickValue('email')

        if (import.meta.env.DEV) {
          console.debug('[ResetPassword] URL', {
            href: window.location.href,
            accessToken: Boolean(accessToken),
            refreshToken: Boolean(refreshToken),
            tokenHashPresent: Boolean(tokenHash),
            codeParamPresent: Boolean(codeParam),
            typeParam,
            emailParam,
            errorDescription,
            hash,
            search: window.location.search,
          })
        }

        if (errorDescription) {
          throw new Error(decodeURIComponent(errorDescription))
        }

        let sessionError = null

        if (codeParam) {
          const { data, error } = await supabase.auth.exchangeCodeForSession({ code: codeParam })
          sessionError = error ?? null
          if (!sessionError && data?.session) {
            await supabase.auth.setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            })
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          sessionError = error ?? null
        } else if (tokenHash || tokenValue) {
          let verifyError = null
          const attemptVerify = async (token) => {
            const payload = {
              type: typeParam === 'email_change' ? 'email_change' : 'recovery',
              token,
            }
            if (emailParam) {
              payload.email = emailParam
            }
            const { data, error } = await supabase.auth.verifyOtp(payload)
            verifyError = error ?? null
            if (!verifyError && data?.session) {
              await supabase.auth.setSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              })
            } else if (!verifyError && data?.user) {
              const { data: sessionData, error: sessionSetError } = await supabase.auth.getSession()
              if (!sessionData?.session && !sessionSetError) {
                const { data: refreshed, error: refreshedError } = await supabase.auth.refreshSession()
                if (refreshedError) {
                  verifyError = refreshedError
                } else if (refreshed?.session) {
                  await supabase.auth.setSession({
                    access_token: refreshed.session.access_token,
                    refresh_token: refreshed.session.refresh_token,
                  })
                }
              }
            }
          }

          if (tokenHash) {
            await attemptVerify(tokenHash)
          }
          if (verifyError && tokenValue && tokenValue !== tokenHash) {
            await attemptVerify(tokenValue)
          }
          if (verifyError) {
            throw verifyError
          }
        } else {
          throw new Error('Token non valido o scaduto. Richiedi un nuovo link di reset.')
        }

        if (!active) return
        if (sessionError) {
          throw sessionError
        }

        window.history.replaceState({}, document.title, window.location.pathname)
      } catch (verificationError) {
        if (!active) return
        setError(verificationError instanceof Error ? verificationError.message : 'Impossibile convalidare il token.')
      } finally {
        if (active) {
          setIsVerifying(false)
        }
      }
    }

    verifyFromUrl()

    return () => {
      active = false
    }
  }, [])

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      if (isSaving) return
      setError(null)
      setMessage(null)

      if (password.trim().length < 8) {
        setError('La password deve contenere almeno 8 caratteri.')
        passwordInputRef.current?.focus()
        return
      }

      if (password.trim() !== confirmPassword.trim()) {
        setError('Le password non coincidono.')
        return
      }

      setIsSaving(true)
      try {
        const { error: updateError } = await supabase.auth.updateUser({ password: password.trim() })
        if (updateError) {
          throw updateError
        }
        setMessage('Password aggiornata correttamente! Puoi tornare alla chat.')
        setPassword('')
        setConfirmPassword('')
        setTimeout(() => {
          onComplete?.()
        }, 1500)
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Impossibile aggiornare la password.')
      } finally {
        setIsSaving(false)
      }
    },
    [confirmPassword, isSaving, onComplete, password],
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-white via-[#f4f6fb] to-[#e8edf7] px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-10 shadow-[0_35px_100px_rgba(148,163,184,0.35)] backdrop-blur">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-slate-800">Reimposta password</h1>
          <p className="mt-2 text-sm text-slate-500">
            Inserisci una nuova password per completare la procedura di reset.
          </p>
        </div>

        {isVerifying ? (
          <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
            <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-[#4fb3c1]" />
            <p>Verifica token in corso…</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-medium text-slate-600">
                Nuova password
              </label>
              <input
                id="new-password"
                type="password"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#4fb3c1] focus:ring-0"
                placeholder="Almeno 8 caratteri"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (!isPasswordDirty) {
                    setIsPasswordDirty(true)
                  }
                  if (error) {
                    setError(null)
                  }
                }}
                disabled={isSaving}
                required
                ref={passwordInputRef}
              />
              {isPasswordDirty && password.trim().length > 0 && password.trim().length < 8 ? (
                <p className="mt-2 text-xs font-medium text-amber-600">
                  Password troppo corta: aggiungi almeno {8 - password.trim().length} caratteri per raggiungere il minimo di 8.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-slate-600">
                Conferma password
              </label>
              <input
                id="confirm-password"
                type="password"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#4fb3c1] focus:ring-0"
                placeholder="Ripeti la password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  if (error) {
                    setError(null)
                  }
                }}
                disabled={isSaving}
                required
              />
            </div>

            {message ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            ) : null}

            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-full bg-gradient-to-br from-[#4fb3c1] via-[#4cc2bc] to-[#48d1b5] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(72,209,181,0.4)] transition hover:scale-[1.01] hover:shadow-[0_20px_45px_rgba(72,209,181,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fb3c1] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSaving}
            >
              {isSaving ? 'Aggiornamento…' : 'Aggiorna password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
