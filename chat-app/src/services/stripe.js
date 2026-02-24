import { loadStripe } from '@stripe/stripe-js'
import { supabase } from './supabaseClient'

// Stripe publishable key dal frontend
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

// Inizializza Stripe (lazy loading)
let stripePromise = null
export function getStripe() {
  if (!stripePromise && stripePublishableKey) {
    stripePromise = loadStripe(stripePublishableKey)
  }
  return stripePromise
}

// URL base per le Edge Functions di Supabase
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

// Piani di abbonamento
export const SUBSCRIPTION_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 20,
    priceId: null, // Da configurare in Stripe Dashboard
    features: [
      'Trascrizione documenti',
      'Analisi base',
      '50 documenti/mese',
      'Supporto email',
    ],
    popular: false,
    active: false, // Non ancora attivo con Stripe
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 75,
    priceId: import.meta.env.VITE_STRIPE_PRICE_PROFESSIONAL, // Attivo
    features: [
      'Tutte le funzioni Starter',
      'Analisi giuridica completa',
      '200 documenti/mese',
      'Template documenti',
      'Emulazione stile',
      'Supporto prioritario',
    ],
    popular: true,
    active: true, // Attivo con Stripe
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 200,
    priceId: null, // Da configurare in Stripe Dashboard
    features: [
      'Tutte le funzioni Professional',
      'Documenti illimitati',
      'API access',
      'Account manager dedicato',
      'Formazione personalizzata',
      'SLA garantito',
    ],
    popular: false,
    active: false, // Non ancora attivo con Stripe
  },
]

// Ottieni l'abbonamento corrente dell'utente
export async function getCurrentSubscription() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Errore nel recupero abbonamento:', error)
    return null
  }

  return data
}

// Crea sessione checkout per un nuovo abbonamento
export async function createCheckoutSession(planId) {
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId)
  
  if (!plan) {
    throw new Error('Piano non trovato')
  }
  
  if (!plan.active || !plan.priceId) {
    throw new Error('Questo piano non è ancora disponibile. Contattaci per maggiori informazioni.')
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Devi effettuare il login per procedere')
  }

  const response = await fetch(`${FUNCTIONS_URL}/create-checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      priceId: plan.priceId,
      planId: plan.id,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Errore nella creazione della sessione di checkout')
  }

  const { sessionId, url } = await response.json()

  // Reindirizza a Stripe Checkout
  if (url) {
    window.location.href = url
  } else {
    // Fallback con redirect tramite Stripe.js
    const stripe = await getStripe()
    if (stripe && sessionId) {
      await stripe.redirectToCheckout({ sessionId })
    }
  }
}

// Crea sessione per il Customer Portal di Stripe
export async function createPortalSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Devi effettuare il login per procedere')
  }

  const response = await fetch(`${FUNCTIONS_URL}/create-portal-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Errore nella creazione della sessione portal')
  }

  const { url } = await response.json()
  
  if (url) {
    window.location.href = url
  }
}

// Cancella abbonamento
export async function cancelSubscription() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('Devi effettuare il login per procedere')
  }

  const response = await fetch(`${FUNCTIONS_URL}/cancel-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Errore nella cancellazione dell\'abbonamento')
  }

  return await response.json()
}

// Helper per formattare lo stato dell'abbonamento
export function formatSubscriptionStatus(status) {
  const statusMap = {
    trialing: 'Periodo di prova',
    active: 'Attivo',
    canceled: 'Cancellato',
    incomplete: 'Incompleto',
    incomplete_expired: 'Scaduto',
    past_due: 'Pagamento in ritardo',
    unpaid: 'Non pagato',
    paused: 'In pausa',
  }
  return statusMap[status] || status
}

// Helper per formattare il nome del piano
export function formatPlanName(plan) {
  const planMap = {
    starter: 'Starter',
    professional: 'Professional',
    enterprise: 'Enterprise',
  }
  return planMap[plan] || plan
}
