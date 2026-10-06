create table public.push_tokens (token text primary key, user_id uuid not null references public.profiles on delete cascade, company_id uuid not null references public.companies, platform text not null check(platform in ('android','ios')), created_at timestamptz not null default now());
create table public.low_stock_deliveries (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies, item_id uuid not null references public.items, recipient text not null, channel text not null check(channel in ('email','push')), sent_at timestamptz not null default now(), unique(item_id,recipient,channel));
alter table public.push_tokens enable row level security;
alter table public.low_stock_deliveries enable row level security;
revoke all on public.push_tokens,public.low_stock_deliveries from anon,authenticated;
create function public.register_push_token(device_token text, platform text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_company_id() is null then raise exception 'Sign in first'; end if;
  if length(device_token) not between 10 and 4096 or platform not in ('android','ios') then raise exception 'Invalid push token'; end if;
  insert into public.push_tokens(token,user_id,company_id,platform) values(device_token,auth.uid(),public.current_company_id(),platform) on conflict(token) do update set user_id=auth.uid(),company_id=public.current_company_id();
end; $$;
revoke all on function public.register_push_token(text,text) from public;
grant execute on function public.register_push_token(text,text) to authenticated;
-- Remove device subscriptions when a profile is deleted. The application also
-- removes its token on sign-out so alerts do not appear after leaving a workspace.
create function public.unregister_push_tokens() returns void language sql security definer set search_path = '' as $$ delete from public.push_tokens where user_id=auth.uid(); $$;
revoke all on function public.unregister_push_tokens() from public;
grant execute on function public.unregister_push_tokens() to authenticated;
create function public.unregister_push_token(device_token text) returns void language sql security definer set search_path = '' as $$ delete from public.push_tokens where token=device_token and user_id=auth.uid(); $$;
revoke all on function public.unregister_push_token(text) from public;
grant execute on function public.unregister_push_token(text) to authenticated;
