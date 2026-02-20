-- Optimize RLS policies to avoid re-evaluating auth.uid() per row
-- Recommended by Supabase: wrap auth.uid() in a subselect

-- Conversations
drop policy if exists "Users can select their conversations" on public.conversations;
drop policy if exists "Users can insert their conversations" on public.conversations;
drop policy if exists "Users can update their conversations" on public.conversations;
drop policy if exists "Users can delete their conversations" on public.conversations;

create policy "Users can select their conversations"
  on public.conversations for select
  using ((select auth.uid()) = user_id);

create policy "Users can insert their conversations"
  on public.conversations for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their conversations"
  on public.conversations for update
  using ((select auth.uid()) = user_id);

create policy "Users can delete their conversations"
  on public.conversations for delete
  using ((select auth.uid()) = user_id);

-- Conversation messages
drop policy if exists "Users can select their conversation messages" on public.conversation_messages;
drop policy if exists "Users can insert their conversation messages" on public.conversation_messages;
drop policy if exists "Users can delete their conversation messages" on public.conversation_messages;

create policy "Users can select their conversation messages"
  on public.conversation_messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users can insert their conversation messages"
  on public.conversation_messages for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their conversation messages"
  on public.conversation_messages for delete
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

