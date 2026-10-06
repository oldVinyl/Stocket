create extension if not exists pg_trgm;
create table public.companies (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), created_at timestamptz not null default now());
create table public.allowed_users (email text primary key check(email = lower(email)), company_id uuid not null references public.companies, invited_by uuid, created_at timestamptz not null default now());
create table public.profiles (id uuid primary key references auth.users on delete cascade, company_id uuid not null references public.companies, name text not null, email text not null, device_info text not null, created_at timestamptz not null default now());
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120), parent_id uuid references public.categories, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(parent_id is distinct from id));
create table public.catalog_items (id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 160), category_id uuid not null references public.categories, image_url text, created_by uuid not null references auth.users, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index catalog_normalized_name on public.catalog_items(lower(regexp_replace(name,'[^a-zA-Z0-9]','','g')));
create index catalog_fuzzy_name on public.catalog_items using gin(name gin_trgm_ops);
create table public.items (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies, catalog_item_id uuid not null references public.catalog_items, quantity bigint not null default 0, low_stock_threshold integer not null default 5 check(low_stock_threshold between 0 and 1000000), created_by uuid not null references auth.users, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), metadata_updated_at timestamptz not null default now(), archived_at timestamptz, unique(company_id,catalog_item_id), unique(id,company_id));
create table public.stock_events (id uuid primary key, company_id uuid not null references public.companies, item_id uuid not null, delta integer not null check(abs(delta::bigint) <= 1000000), new_quantity bigint not null, created_by uuid not null references auth.users, created_at timestamptz not null default now(), source text not null check(source in ('online','synced_offline')), foreign key(item_id,company_id) references public.items(id,company_id));
create table public.mutation_receipts (id uuid primary key, company_id uuid not null references public.companies, created_at timestamptz not null default now());
create table public.item_aliases (client_item_id uuid primary key, company_id uuid not null references public.companies, item_id uuid not null, foreign key(item_id,company_id) references public.items(id,company_id));
create table public.catalog_reports (id uuid primary key default gen_random_uuid(), catalog_item_id uuid not null references public.catalog_items, company_id uuid not null references public.companies, created_by uuid not null references auth.users, reason text not null check(length(reason) between 3 and 500), created_at timestamptz not null default now());
create index on public.items(company_id);
create index on public.stock_events(company_id,created_at desc);
create index on public.profiles(company_id);

create function public.current_company_id() returns uuid language sql stable security definer set search_path = '' as $$ select company_id from public.profiles where id = auth.uid(); $$;
revoke all on function public.current_company_id() from public;
grant execute on function public.current_company_id() to authenticated;

alter table public.companies enable row level security;
alter table public.allowed_users enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.catalog_items enable row level security;
alter table public.items enable row level security;
alter table public.stock_events enable row level security;
alter table public.mutation_receipts enable row level security;
alter table public.item_aliases enable row level security;
alter table public.catalog_reports enable row level security;
create policy company_read on public.companies for select to authenticated using(id = public.current_company_id());
create policy profile_read on public.profiles for select to authenticated using(company_id = public.current_company_id());
create policy category_read on public.categories for select to authenticated using(public.current_company_id() is not null);
create policy catalog_read on public.catalog_items for select to authenticated using(public.current_company_id() is not null);
create policy item_read on public.items for select to authenticated using(company_id = public.current_company_id());
create policy event_read on public.stock_events for select to authenticated using(company_id = public.current_company_id());
create policy report_read on public.catalog_reports for select to authenticated using(company_id = public.current_company_id());
-- All writes go through checked functions. No client can change company_id,
-- overwrite a quantity, forge created_by, or edit the invitation allowlist.
revoke all on public.companies, public.allowed_users, public.profiles, public.categories, public.catalog_items, public.items, public.stock_events, public.mutation_receipts, public.item_aliases, public.catalog_reports from anon, authenticated;
grant select on public.companies, public.profiles, public.categories, public.catalog_items, public.items, public.stock_events, public.catalog_reports to authenticated;

create function public.onboard(display_name text, device_label text) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare member public.profiles; invitation public.allowed_users; verified_email text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if verified_email is null then raise exception 'Verify your email first'; end if;
  select * into invitation from public.allowed_users where email=verified_email;
  if invitation.email is null then raise exception 'Your company has not invited this email yet'; end if;
  if length(trim(display_name)) not between 1 and 80 or length(device_label) > 200 then raise exception 'Enter a valid name and device label'; end if;
  insert into public.profiles(id,company_id,name,email,device_info) values(auth.uid(),invitation.company_id,trim(display_name),verified_email,device_label) on conflict(id) do nothing;
  select * into member from public.profiles where id=auth.uid(); return member;
end; $$;

create function public.apply_inventory_mutation(operation jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare tenant uuid := public.current_company_id(); actor uuid := auth.uid(); op_id uuid := (operation->>'id')::uuid; target uuid := (operation->>'item_id')::uuid; kind text := operation->>'kind'; stamp timestamptz := (operation->>'created_at')::timestamptz; item public.items; catalog_id uuid; change integer; threshold integer; inserted integer;
begin
  if tenant is null then raise exception 'Complete company sign-in first'; end if;
  if op_id is null or target is null or stamp is null or stamp > now() + interval '5 minutes' or kind is null or kind not in ('add','adjust','edit','archive','category') then raise exception 'Invalid operation'; end if;
  if operation->>'source' is null or operation->>'source' not in ('online','synced_offline') then raise exception 'Invalid event source'; end if;
  insert into public.mutation_receipts(id,company_id) values(op_id,tenant) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    if not exists(select 1 from public.mutation_receipts where id=op_id and company_id=tenant) then raise exception 'Operation belongs to another company'; end if;
    return jsonb_build_object('ok',true,'replayed',true);
  end if;
  if kind='category' then
    if target <> (operation->'category'->>'id')::uuid then raise exception 'Category ID mismatch'; end if;
    if exists(with recursive ancestors as (select id,parent_id from public.categories where id=(operation->'category'->>'parent_id')::uuid union select c.id,c.parent_id from public.categories c join ancestors a on c.id=a.parent_id) select 1 from ancestors where id=target) then raise exception 'A category cannot be nested inside itself'; end if;
    insert into public.categories(id,name,parent_id,updated_at) values(target,trim(operation->'category'->>'name'),(operation->'category'->>'parent_id')::uuid,stamp) on conflict(id) do update set name=excluded.name,parent_id=excluded.parent_id,updated_at=stamp where public.categories.updated_at<=stamp;
    return jsonb_build_object('ok',true);
  end if;
  if kind = 'add' then
    change := (operation->>'delta')::integer; threshold := (operation->>'threshold')::integer;
    if change is null or change not between 0 and 1000000 or threshold is null or threshold not between 0 and 1000000 then raise exception 'Invalid quantity or threshold'; end if;
    catalog_id := (operation->'catalog'->>'id')::uuid;
    insert into public.catalog_items(id,name,category_id,image_url,created_by,updated_at) values(catalog_id,trim(operation->'catalog'->>'name'),(operation->'catalog'->>'category_id')::uuid,operation->'catalog'->>'image_url',actor,stamp) on conflict do nothing;
    -- Resolve equivalent names contributed concurrently to a single shared item.
    select id into catalog_id from public.catalog_items where lower(regexp_replace(name,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(operation->'catalog'->>'name','[^a-zA-Z0-9]','','g'));
    if catalog_id is null then raise exception 'Catalog item could not be resolved'; end if;
    insert into public.items(id,company_id,catalog_item_id,low_stock_threshold,created_by,updated_at,metadata_updated_at) values(target,tenant,catalog_id,threshold,actor,stamp,stamp) on conflict(company_id,catalog_item_id) do nothing;
    select * into item from public.items where company_id=tenant and catalog_item_id=catalog_id;
    if item.id <> target then insert into public.item_aliases(client_item_id,company_id,item_id) values(target,tenant,item.id); target := item.id; end if;
  end if;
  select coalesce((select item_id from public.item_aliases where client_item_id=target and company_id=tenant),target) into target;
  select * into item from public.items where id=target and company_id=tenant for update;
  if item.id is null then raise exception 'Item is not in your company'; end if;
  if kind in ('add','adjust') then
    -- A deduction recorded before another device removed the item still belongs
    -- in its event log. The UI keeps removed items out of the adjust flow.
    change := (operation->>'delta')::integer;
    if change is null or abs(change::bigint)>1000000 or (kind='adjust' and change=0) then raise exception 'Invalid stock delta'; end if;
    insert into public.stock_events(id,company_id,item_id,delta,new_quantity,created_by,source) values(op_id,tenant,target,change,item.quantity+change,actor,operation->>'source');
    -- The row lock makes concurrent devices additive; the unique event ID makes retries safe.
    update public.items set quantity=(select sum(delta) from public.stock_events where item_id=target),updated_at=greatest(updated_at,stamp) where id=target;
  elsif stamp >= item.metadata_updated_at then
    if kind='edit' then
      threshold := (operation->>'threshold')::integer;
      if threshold is null or threshold not between 0 and 1000000 then raise exception 'Invalid threshold'; end if;
      update public.items set low_stock_threshold=threshold,updated_at=greatest(updated_at,stamp),metadata_updated_at=stamp where id=target;
      if operation->'catalog' is not null then
        if (operation->'catalog'->>'id')::uuid <> item.catalog_item_id then raise exception 'Catalog item mismatch'; end if;
        update public.catalog_items set name=trim(operation->'catalog'->>'name'),category_id=(operation->'catalog'->>'category_id')::uuid,updated_at=stamp where id=item.catalog_item_id and updated_at<=stamp;
      end if;
    elsif kind='archive' then
      if jsonb_typeof(operation->'archived') is distinct from 'boolean' then raise exception 'Invalid archive state'; end if;
      update public.items set archived_at=case when (operation->>'archived')::boolean then stamp else null end,updated_at=greatest(updated_at,stamp),metadata_updated_at=stamp where id=target;
    end if;
  end if;
  return jsonb_build_object('ok',true);
end; $$;

create function public.create_category(category_name text, parent uuid default null) returns public.categories language plpgsql security definer set search_path = '' as $$
declare result public.categories;
begin
  if public.current_company_id() is null then raise exception 'Sign in first'; end if;
  if length(trim(category_name)) not between 1 and 120 then raise exception 'Enter a category name'; end if;
  insert into public.categories(name,parent_id) values(trim(category_name),parent) returning * into result; return result;
end; $$;
create function public.report_catalog(catalog_id uuid, explanation text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_company_id() is null then raise exception 'Sign in first'; end if;
  insert into public.catalog_reports(catalog_item_id,company_id,created_by,reason) values(catalog_id,public.current_company_id(),auth.uid(),explanation);
end; $$;
revoke all on function public.onboard(text,text),public.apply_inventory_mutation(jsonb),public.create_category(text,uuid),public.report_catalog(uuid,text) from public;
grant execute on function public.onboard(text,text),public.apply_inventory_mutation(jsonb),public.create_category(text,uuid),public.report_catalog(uuid,text) to authenticated;

insert into public.categories(id,name) values
('10000000-0000-4000-8000-000000000001','Paper & notes'),
('10000000-0000-4000-8000-000000000002','Ink & toner'),
('10000000-0000-4000-8000-000000000003','Desk essentials'),
('10000000-0000-4000-8000-000000000004','Filing & packing');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('catalog-images','catalog-images',false,1048576,array['image/webp']);
create policy catalog_photo_read on storage.objects for select to authenticated using(bucket_id='catalog-images' and public.current_company_id() is not null);
create policy catalog_photo_create on storage.objects for insert to authenticated with check(bucket_id='catalog-images' and public.current_company_id() is not null and (storage.foldername(name))[1]=auth.uid()::text);
