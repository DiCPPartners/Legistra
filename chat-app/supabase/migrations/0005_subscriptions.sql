-- Migration: Create subscriptions table for Stripe integration
-- Tabella per gestire gli abbonamenti degli utenti

-- Crea enum per lo stato dell'abbonamento
create type subscription_status as enum (
  'trialing',
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'unpaid',
  'paused'
);

-- Crea enum per il tipo di piano
create type subscription_plan as enum (
  'starter',    -- €20/mese
  'professional', -- €75/mese
  'enterprise'  -- €200/mese
);

-- Crea tabella subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan subscription_plan not null default 'starter',
  status subscription_status not null default 'incomplete',
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean default false,
  canceled_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Crea indici per performance
create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_stripe_customer_id on public.subscriptions(stripe_customer_id);
create index idx_subscriptions_stripe_subscription_id on public.subscriptions(stripe_subscription_id);
create index idx_subscriptions_status on public.subscriptions(status);

-- Abilita RLS
alter table public.subscriptions enable row level security;

-- Policy: Gli utenti possono vedere solo il proprio abbonamento
create policy "Users can view their own subscription."
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Policy: Gli utenti possono inserire il proprio abbonamento
create policy "Users can insert their own subscription."
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

-- Policy: Gli utenti possono aggiornare il proprio abbonamento
create policy "Users can update their own subscription."
  on public.subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Funzione per aggiornare updated_at automaticamente
create or replace function update_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger per updated_at
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row
  execute function update_subscriptions_updated_at();

-- Commenti per documentazione
comment on table public.subscriptions is 'Tabella per gestire gli abbonamenti Stripe degli utenti';
comment on column public.subscriptions.plan is 'Tipo di piano: starter (€20), professional (€75), enterprise (€200)';
comment on column public.subscriptions.status is 'Stato dell''abbonamento sincronizzato con Stripe';
