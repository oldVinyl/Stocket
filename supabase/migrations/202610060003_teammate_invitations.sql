-- Members may invite only into their own company; the allowlist stays private.
create function public.invite_teammate(invitee_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  tenant uuid := public.current_company_id();
  target_email text := lower(trim(invitee_email));
  invitation public.allowed_users;
begin
  if actor is null or tenant is null then
    raise exception 'Complete company sign-in before inviting teammates';
  end if;
  if target_email is null or length(target_email) > 254
     or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid teammate email';
  end if;
  -- Serialize invitations from different companies for the same address.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_email, 0));
  select * into invitation from public.allowed_users where email = target_email;
  if (invitation.email is not null and invitation.company_id <> tenant)
     or exists(select 1 from public.profiles where lower(email) = target_email and company_id <> tenant) then
    raise exception 'This email cannot be invited to your company';
  end if;
  if invitation.email is not null then
    return jsonb_build_object('email', target_email, 'created', false);
  end if;
  insert into public.allowed_users(email, company_id, invited_by)
    values(target_email, tenant, actor);
  return jsonb_build_object('email', target_email, 'created', true);
end;
$$;
revoke all on function public.invite_teammate(text) from public, anon;
grant execute on function public.invite_teammate(text) to authenticated;
