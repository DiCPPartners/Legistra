import { useCallback, useEffect, useState } from 'react'
import Logo from './Logo'
import {
  SUBSCRIPTION_PLANS,
  getCurrentSubscription,
  createCheckoutSession,
  createPortalSession,
  formatSubscriptionStatus,
  formatPlanName,
} from '../services/stripe'

export default function SubscriptionPlans({ onBack }) {
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [processingPlan, setProcessingPlan] = useState(null)
  const [error, setError] = useState(null)

  // Carica abbonamento corrente
  useEffect(() => {
    async function loadSubscription() {
      try {
        const sub = await getCurrentSubscription()
        setSubscription(sub)
      } catch (err) {
        console.error('Errore caricamento abbonamento:', err)
      } finally {
        setLoading(false)
      }
    }
    loadSubscription()
  }, [])

  // Gestisci selezione piano
  const handleSelectPlan = useCallback(async (planId) => {
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId)
    
    if (!plan?.active) {
      setError('Questo piano non è ancora disponibile. Contattaci per maggiori informazioni.')
      return
    }

    setProcessingPlan(planId)
    setError(null)

    try {
      await createCheckoutSession(planId)
    } catch (err) {
      setError(err.message)
      setProcessingPlan(null)
    }
  }, [])

  // Gestisci accesso al portal
  const handleManageSubscription = useCallback(async () => {
    setError(null)
    setProcessingPlan('manage')
    
    try {
      await createPortalSession()
    } catch (err) {
      setError(err.message)
      setProcessingPlan(null)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#3eb8a8]" />
          <p className="text-slate-500">Caricamento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 transition hover:text-slate-900"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-medium">Torna alla chat</span>
          </button>
          
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3eb8a8] to-[#2f9aa7] shadow-lg shadow-teal-500/20">
              <Logo className="h-6 w-6" color="white" />
            </div>
            <span className="text-xl font-bold text-slate-800" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: '-0.01em' }}>Legistra</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-16">
        {/* Title Section */}
        <div className="mb-16 text-center">
          <h1 className="mb-4 text-4xl font-bold text-slate-900 sm:text-5xl">
            Scegli il piano perfetto per te
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-600">
            Accedi a strumenti avanzati per l'analisi giuridica. Annulla quando vuoi.
          </p>
        </div>

        {/* Current Subscription Banner */}
        {subscription && subscription.status === 'active' && (
          <div className="mb-12 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-6">
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                  <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    Abbonamento {formatPlanName(subscription.plan)} attivo
                  </p>
                  <p className="text-sm text-slate-600">
                    Stato: {formatSubscriptionStatus(subscription.status)}
                    {subscription.current_period_end && (
                      <> • Rinnovo: {new Date(subscription.current_period_end).toLocaleDateString('it-IT')}</>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={processingPlan === 'manage'}
                className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:shadow-md disabled:opacity-50"
              >
                {processingPlan === 'manage' ? 'Caricamento...' : 'Gestisci abbonamento'}
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isCurrentPlan = subscription?.plan === plan.id && subscription?.status === 'active'
            const isProcessing = processingPlan === plan.id

            return (
              <div
                key={plan.id}
                className={`relative overflow-hidden rounded-3xl border-2 bg-white p-8 transition-all duration-300 ${
                  plan.popular
                    ? 'border-[#3eb8a8] shadow-2xl shadow-teal-500/20 ring-4 ring-teal-500/10'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-xl'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -right-12 top-6 rotate-45 bg-gradient-to-r from-[#3eb8a8] to-[#2f9aa7] px-12 py-1.5 text-sm font-semibold text-white shadow-lg">
                    Più popolare
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-8">
                  <h3 className="mb-2 text-2xl font-bold text-slate-900">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-slate-900">€{plan.price}</span>
                    <span className="text-lg text-slate-500">/mese</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="mb-8 space-y-4">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                        plan.popular ? 'bg-[#3eb8a8]' : 'bg-slate-200'
                      }`}>
                        <svg className={`h-3 w-3 ${plan.popular ? 'text-white' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-slate-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isCurrentPlan || isProcessing || !plan.active}
                  className={`w-full rounded-xl px-6 py-4 text-lg font-semibold transition-all duration-200 ${
                    isCurrentPlan
                      ? 'cursor-default bg-emerald-100 text-emerald-700'
                      : plan.popular
                        ? 'bg-gradient-to-r from-[#3eb8a8] to-[#2f9aa7] text-white shadow-lg shadow-teal-500/30 hover:shadow-xl hover:shadow-teal-500/40 disabled:opacity-50'
                        : plan.active
                          ? 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50'
                          : 'cursor-not-allowed bg-slate-100 text-slate-400'
                  }`}
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Caricamento...
                    </span>
                  ) : isCurrentPlan ? (
                    <>Piano attuale</>
                  ) : !plan.active ? (
                    <>Prossimamente</>
                  ) : (
                    <>Inizia ora</>
                  )}
                </button>

                {/* Not Active Notice */}
                {!plan.active && (
                  <p className="mt-4 text-center text-sm text-slate-500">
                    Contattaci per attivare questo piano
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* FAQ Section */}
        <div className="mt-20">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-900">Domande frequenti</h2>
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="mb-2 font-semibold text-slate-900">Posso cancellare in qualsiasi momento?</h3>
              <p className="text-slate-600">Sì, puoi cancellare il tuo abbonamento in qualsiasi momento. Avrai accesso al servizio fino alla fine del periodo già pagato.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="mb-2 font-semibold text-slate-900">Come funziona il pagamento?</h3>
              <p className="text-slate-600">I pagamenti vengono processati in modo sicuro tramite Stripe. Accettiamo tutte le principali carte di credito e debito.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="mb-2 font-semibold text-slate-900">Posso cambiare piano?</h3>
              <p className="text-slate-600">Sì, puoi passare a un piano superiore o inferiore in qualsiasi momento. La differenza verrà calcolata proporzionalmente.</p>
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="mt-16 text-center">
          <p className="text-slate-600">
            Hai bisogno di un piano personalizzato?{' '}
            <a href="mailto:info@legistra.app" className="font-semibold text-[#3eb8a8] hover:underline">
              Contattaci
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
