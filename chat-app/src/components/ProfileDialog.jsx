import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
// STRIPE_DISABLED: Import Stripe commentato temporaneamente
// import { getCurrentSubscription, createPortalSession, formatSubscriptionStatus, formatPlanName, SUBSCRIPTION_PLANS } from '../services/stripe'

const initialForm = {
  firstName: '',
  lastName: '',
}

const validateEmail = (value) => /.+@.+\..+/.test(value)

function ChangeEmailDialog({ isOpen, onClose, currentEmail, onEmailUpdated }) {
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setNewEmail('')
      setError(null)
      setMessage(null)
      setIsSaving(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSaving) return
    setError(null)
    setMessage(null)

    if (!validateEmail(newEmail.trim())) {
      setError('Inserisci un indirizzo email valido.')
      return
    }
    if (newEmail.trim() === (currentEmail ?? '').trim()) {
      setError('La nuova email deve essere diversa da quella attuale.')
      return
    }

    setIsSaving(true)
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (updateError) {
        throw updateError
      }
      setMessage(
        `Abbiamo inviato un'email all'indirizzo ${newEmail.trim()} con il link per confermare il cambio email.`,
      )
      await onEmailUpdated?.(data?.user ?? null)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Impossibile aggiornare l’email.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white/95 p-8 shadow-[0_40px_120px_rgba(15,23,42,0.25)]">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Cambia email</h3>
            <p className="mt-1 text-sm text-slate-500">
              Riceverai un link di conferma alla nuova email.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Chiudi dialogo email"
            disabled={isSaving}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="new-email" className="mb-1 block text-sm font-medium text-slate-600">
              Nuova email
            </label>
            <input
              id="new-email"
              type="email"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#4fb3c1] focus:ring-0"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
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

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
              disabled={isSaving}
            >
              Annulla
            </button>
            <button
              type="submit"
              className="rounded-full bg-gradient-to-br from-[#4fb3c1] via-[#4cc2bc] to-[#48d1b5] px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(72,209,181,0.4)] transition hover:scale-[1.01] hover:shadow-[0_20px_45px_rgba(72,209,181,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fb3c1] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSaving}
            >
              {isSaving ? 'Invio in corso…' : 'Invia conferme'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChangePasswordDialog({ isOpen, onClose, currentEmail }) {
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMessage(null)
      setError(null)
      setIsSending(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSendLink = async () => {
    if (isSending) return
    setMessage(null)
    setError(null)
    setIsSending(true)
    try {
      const baseUrl = window.location.origin.replace(/\/$/, '')
      const query = new URLSearchParams({
        type: 'recovery',
        email: currentEmail ?? '',
      })
      const redirectTo = `${baseUrl}/auth/reset?${query.toString()}`
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(currentEmail ?? '', {
        redirectTo,
      })
      if (resetError) {
        throw resetError
      }
      setMessage('Abbiamo inviato un’email al tuo indirizzo con il link per aggiornare la password.')
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Impossibile inviare il link di reset.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white/95 p-8 shadow-[0_40px_120px_rgba(15,23,42,0.25)]">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Cambia password</h3>
            <p className="mt-1 text-sm text-slate-500">
              Riceverai un link di conferma alla tua mail.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Chiudi dialogo password"
            disabled={isSending}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {message ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
            disabled={isSending}
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={handleSendLink}
            className="rounded-full bg-gradient-to-br from-[#4fb3c1] via-[#4cc2bc] to-[#48d1b5] px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(72,209,181,0.4)] transition hover:scale-[1.01] hover:shadow-[0_20px_45px_rgba(72,209,181,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fb3c1] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSending}
          >
            {isSending ? 'Invio…' : 'Invia link di reset'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProfileDialog({ isOpen, onClose, profile, onProfileUpdated, onSignOut }) {
  const initialValues = useMemo(
    () => ({
      firstName: profile?.firstName ?? '',
      lastName: profile?.lastName ?? '',
    }),
    [profile?.firstName, profile?.lastName],
  )

  const [formValues, setFormValues] = useState(initialForm)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false)
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true)
  const [isManagingSubscription, setIsManagingSubscription] = useState(false)

  const currentEmail = profile?.email ?? ''

  useEffect(() => {
    if (isOpen) {
      setFormValues(initialValues)
      setIsSaving(false)
      setMessage(null)
      setError(null)
      // STRIPE_DISABLED: loadSubscription() // Disabilitato temporaneamente
    }
  }, [initialValues, isOpen])

  // STRIPE_DISABLED: Funzioni abbonamento disabilitate temporaneamente
  const loadSubscription = async () => {
    setIsLoadingSubscription(true)
    try {
      // const sub = await getCurrentSubscription()
      // setSubscription(sub)
      setSubscription(null) // Nessun abbonamento durante test
    } catch (err) {
      console.error('Errore caricamento abbonamento:', err)
    } finally {
      setIsLoadingSubscription(false)
    }
  }

  const handleManageSubscription = useCallback(async () => {
    // STRIPE_DISABLED: Gestione abbonamento disabilitata temporaneamente
    return
    // setIsManagingSubscription(true)
    // try {
    //   await createPortalSession()
    // } catch (err) {
    //   setError(err.message || 'Errore nell\'accesso alla gestione abbonamento')
    // } finally {
    //   setIsManagingSubscription(false)
    // }
  }, [])

  const handleChange = useCallback((field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleSave = useCallback(
    async (event) => {
      event.preventDefault()
      if (isSaving) return
      setMessage(null)
      setError(null)

      const { firstName, lastName } = formValues

      if (!firstName.trim() || !lastName.trim()) {
        setError('Inserisci sia il nome sia il cognome.')
        return
      }

      const metadataUpdates = {}

      if (firstName.trim() !== (profile?.firstName ?? '')) {
        metadataUpdates.first_name = firstName.trim()
      }

      if (lastName.trim() !== (profile?.lastName ?? '')) {
        metadataUpdates.last_name = lastName.trim()
      }

      if (!Object.keys(metadataUpdates).length) {
        setMessage('Nessuna modifica da salvare.')
        return
      }

      setIsSaving(true)
      try {
        const { data, error: updateError } = await supabase.auth.updateUser({ data: metadataUpdates })
        if (updateError) {
          throw updateError
        }

        setMessage('Modifiche salvate correttamente.')
        await onProfileUpdated?.(data?.user ?? null)
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Impossibile aggiornare il profilo.')
      } finally {
        setIsSaving(false)
      }
    },
    [formValues, isSaving, onProfileUpdated, profile?.firstName, profile?.lastName],
  )

  const handleClose = useCallback(() => {
    if (isSaving) return
    onClose?.()
  }, [isSaving, onClose])

  const handleEmailDialogClose = useCallback(() => {
    setIsEmailDialogOpen(false)
  }, [])

  const handlePasswordDialogClose = useCallback(() => {
    setIsPasswordDialogOpen(false)
  }, [])

  const handleEmailUpdated = useCallback(
    async (user) => {
      await onProfileUpdated?.(user ?? null)
    },
    [onProfileUpdated],
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white/95 p-8 shadow-[0_40px_120px_rgba(15,23,42,0.25)]">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">Profilo personale</h2>
            <p className="mt-1 text-sm text-slate-500">Aggiorna i tuoi dati o esci dall’account.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Chiudi modale profilo"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-4 w-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="profile-first-name" className="mb-1 block text-sm font-medium text-slate-600">
                Nome
              </label>
              <input
                id="profile-first-name"
                type="text"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#4fb3c1] focus:ring-0"
                value={formValues.firstName}
                onChange={(event) => handleChange('firstName', event.target.value)}
                disabled={isSaving}
                required
              />
            </div>
            <div>
              <label htmlFor="profile-last-name" className="mb-1 block text-sm font-medium text-slate-600">
                Cognome
              </label>
              <input
                id="profile-last-name"
                type="text"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-[#4fb3c1] focus:ring-0"
                value={formValues.lastName}
                onChange={(event) => handleChange('lastName', event.target.value)}
                disabled={isSaving}
                required
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Email</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{profile?.email ?? 'Non disponibile'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEmailDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
                >
                  Cambia email
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Password</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">••••••••</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPasswordDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
                >
                  Cambia password
                </button>
              </div>
            </div>

            {/* STRIPE_DISABLED: Sezione abbonamento nascosta temporaneamente */}
            {/* <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Abbonamento</p>
                  {isLoadingSubscription ? (
                    <p className="mt-1 text-sm font-semibold text-slate-700">Caricamento...</p>
                  ) : subscription?.status === 'active' ? (
                    <>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {formatPlanName(subscription.plan)} - {formatSubscriptionStatus(subscription.status)}
                      </p>
                      {subscription.current_period_end && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          Rinnovo: {new Date(subscription.current_period_end).toLocaleDateString('it-IT')}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-slate-700">Nessun abbonamento attivo</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleManageSubscription}
                  disabled={isManagingSubscription || isLoadingSubscription}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                >
                  {isManagingSubscription ? 'Caricamento...' : subscription?.status === 'active' ? 'Gestisci' : 'Abbonati'}
                </button>
              </div>
            </div> */}
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          ) : null}

          {message ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-[#4fb3c1] via-[#4cc2bc] to-[#48d1b5] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(72,209,181,0.4)] transition hover:scale-[1.01] hover:shadow-[0_20px_45px_rgba(72,209,181,0.5)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4fb3c1] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSaving}
            >
              {isSaving ? 'Salvataggio…' : 'Salva modifiche'}
            </button>
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-2 self-start rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-500 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-4 w-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 5.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15M18 9l3 3m0 0l-3 3m3-3H9" />
                </svg>
                Esci dall’account
              </button>
            ) : null}
          </div>
        </form>
      </div>
      <ChangeEmailDialog
        isOpen={isEmailDialogOpen}
        onClose={handleEmailDialogClose}
        currentEmail={currentEmail}
        onEmailUpdated={handleEmailUpdated}
      />
      <ChangePasswordDialog
        isOpen={isPasswordDialogOpen}
        onClose={handlePasswordDialogClose}
        currentEmail={currentEmail}
      />
    </div>
  )
}
