-- Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_idx on public.conversations(user_id);

alter table public.conversations enable row level security;

create policy "Users can select their conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert their conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

create policy "Users can delete their conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- Messages table
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_conversation_id_idx on public.conversation_messages(conversation_id);

alter table public.conversation_messages enable row level security;

create policy "Users can select their conversation messages"
  on public.conversation_messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "Users can insert their conversation messages"
  on public.conversation_messages for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "Users can delete their conversation messages"
  on public.conversation_messages for delete
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create function public.touch_conversation_updated_at()
returns trigger as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_touch_conversation_after_insert
  after insert on public.conversation_messages
  for each row execute function public.touch_conversation_updated_at();
