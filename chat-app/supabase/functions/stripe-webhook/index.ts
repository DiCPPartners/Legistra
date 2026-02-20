import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') as string

// Client Supabase con service role per bypassare RLS
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Webhook signature mancante', { status: 400 })
  }

  try {
    const body = await req.text()
    
    // Verifica la firma del webhook
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    
    console.log(`Evento ricevuto: ${event.type}`)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdated(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(subscription)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaymentSucceeded(invoice)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaymentFailed(invoice)
        break
      }

      default:
        console.log(`Evento non gestito: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Errore webhook:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400 }
    )
  }
})

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id
  const planId = session.metadata?.plan_id || 'professional'
  
  if (!userId) {
    console.error('User ID mancante nei metadata della sessione')
    return
  }

  // Ottieni la subscription da Stripe
  if (session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
    
    await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: userId,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscription.id,
        plan: planId,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
      }, {
        onConflict: 'user_id',
      })

    console.log(`Abbonamento creato per utente ${userId}`)
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.supabase_user_id
  
  if (!userId) {
    // Cerca per stripe_subscription_id
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', subscription.id)
      .single()
    
    if (!existingSub) {
      console.error('Utente non trovato per subscription:', subscription.id)
      return
    }
    
    await updateSubscriptionInDb(existingSub.user_id, subscription)
  } else {
    await updateSubscriptionInDb(userId, subscription)
  }
}

async function updateSubscriptionInDb(userId: string, subscription: Stripe.Subscription) {
  const planId = subscription.metadata?.plan_id || 'professional'
  
  await supabaseAdmin
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscription.id,
      plan: planId,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at 
        ? new Date(subscription.canceled_at * 1000).toISOString() 
        : null,
    })
    .eq('user_id', userId)

  console.log(`Abbonamento aggiornato per utente ${userId}`)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .single()

  if (existingSub) {
    await supabaseAdmin
      .from('subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      })
      .eq('user_id', existingSub.user_id)

    console.log(`Abbonamento cancellato per utente ${existingSub.user_id}`)
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string)
    
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', subscription.id)
      .single()

    if (existingSub) {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        })
        .eq('user_id', existingSub.user_id)

      console.log(`Pagamento riuscito per utente ${existingSub.user_id}`)
    }
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  if (invoice.subscription) {
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', invoice.subscription as string)
      .single()

    if (existingSub) {
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'past_due',
        })
        .eq('user_id', existingSub.user_id)

      console.log(`Pagamento fallito per utente ${existingSub.user_id}`)
    }
  }
}
