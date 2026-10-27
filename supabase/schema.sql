-- Run once in a NEW Supabase project's SQL editor, as its database owner.
-- Do not disable RLS and do not distribute a service_role/secret key.
begin;
create table if not exists public.todo_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id uuid not null,
  body jsonb not null,
  version bigint not null default 1 check(version > 0),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id,id),
  constraint todo_body_object check(jsonb_typeof(body)='object'),
  constraint todo_body_id check(body ? 'id' and body->>'id'=id::text),
  constraint todo_title_length check(body ? 'title' and jsonb_typeof(body->'title')='string' and length(btrim(body->>'title')) between 1 and 200)
);
alter table public.todo_items enable row level security;
alter table public.todo_items force row level security;
revoke all on public.todo_items from anon;
revoke all on public.todo_items from authenticated;
grant select,insert,update on public.todo_items to authenticated;

drop policy if exists todo_select_own on public.todo_items;
create policy todo_select_own on public.todo_items for select to authenticated using((select auth.uid())=user_id);
drop policy if exists todo_insert_own on public.todo_items;
create policy todo_insert_own on public.todo_items for insert to authenticated with check((select auth.uid())=user_id);
drop policy if exists todo_update_own on public.todo_items;
create policy todo_update_own on public.todo_items for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

-- Atomic optimistic concurrency. Two PCs editing the same revision cannot silently
-- overwrite each other. Tombstones preserve deletes when another PC was offline.
create or replace function public.apply_todo_change(
  p_id uuid, p_body jsonb, p_expected_version bigint, p_deleted boolean default false
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.todo_items; applied boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_expected_version < 0 or p_expected_version is null then raise exception 'invalid version'; end if;
  if p_expected_version=0 then
    insert into public.todo_items(user_id,id,body,version,deleted)
      values(auth.uid(),p_id,p_body,1,p_deleted)
      on conflict(user_id,id) do nothing returning * into item;
    applied := found;
  else
    update public.todo_items set body=p_body,deleted=p_deleted,version=version+1,updated_at=now()
      where user_id=auth.uid() and id=p_id and version=p_expected_version returning * into item;
    applied := found;
  end if;
  if not applied then
    select * into item from public.todo_items where user_id=auth.uid() and id=p_id;
    if not found then raise exception 'missing remote row; restore the row before retrying'; end if;
  end if;
  return jsonb_build_object('applied',applied,'item',to_jsonb(item));
end $$;
revoke all on function public.apply_todo_change(uuid,jsonb,bigint,boolean) from public,anon;
grant execute on function public.apply_todo_change(uuid,jsonb,bigint,boolean) to authenticated;
commit;
notify pgrst,'reload schema';
