-- Migration 002: security helpers, RLS, protected views, storage, and audit triggers.

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.request_ip()
returns inet language plpgsql stable set search_path = public, pg_temp as $$
declare headers jsonb; value text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
    value := coalesce(headers->>'cf-connecting-ip', split_part(headers->>'x-forwarded-for', ',', 1), headers->>'x-real-ip');
    return nullif(trim(value), '')::inet;
  exception when others then return null;
  end;
end;
$$;

create or replace function public.request_user_agent()
returns text language plpgsql stable set search_path = public, pg_temp as $$
declare headers jsonb;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
    return left(headers->>'user-agent', 500);
  exception when others then return null;
  end;
end;
$$;

create or replace function public.current_role_code()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select r.code from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=auth.uid() and p.status='ACTIVE'
$$;

create or replace function public.current_role_rank()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select r.rank from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=auth.uid() and p.status='ACTIVE'
$$;

create or replace function public.has_permission(p_code text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.profiles pr
    join public.roles r on r.id=pr.role_id
    join public.role_permissions rp on rp.role_id=r.id
    join public.permissions p on p.id=rp.permission_id
    where pr.id=auth.uid() and pr.status='ACTIVE' and p.code=p_code
  )
$$;

create or replace function public.require_permission(p_code text)
returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not public.has_permission(p_code) then raise exception 'You do not have permission to perform this action' using errcode='42501'; end if;
end;
$$;

create or replace function public.audit_event(
  p_action text,
  p_description text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  insert into public.activity_logs(user_id,action,description,entity_type,entity_id,ip_address,user_agent,metadata)
  values(auth.uid(),upper(p_action),left(p_description,1000),p_entity_type,p_entity_id,public.request_ip(),public.request_user_agent(),coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.notify_permission(
  p_permission text,
  p_type text,
  p_title text,
  p_message text,
  p_severity text default 'info',
  p_link text default null,
  p_source_entity_type text default null,
  p_source_entity_id uuid default null,
  p_expires_at timestamptz default null
) returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  insert into public.notifications(target_user_id,type,title,message,severity,link,source_entity_type,source_entity_id,expires_at)
  select distinct pr.id,p_type,left(p_title,200),left(p_message,1000),p_severity,p_link,p_source_entity_type,p_source_entity_id,p_expires_at
  from public.profiles pr
  join public.role_permissions rp on rp.role_id=pr.role_id
  join public.permissions pe on pe.id=rp.permission_id and pe.code=p_permission
  where pr.status='ACTIVE'
    and not exists (
      select 1 from public.notifications n where n.target_user_id=pr.id and n.type=p_type
        and n.source_entity_id is not distinct from p_source_entity_id and not n.is_read
    );
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_role uuid; v_username text; v_staff_id text; v_name text;
begin
  select id into v_role from public.roles where code='VIEWER';
  v_username := lower(coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1), 'user-'||left(new.id::text,8)));
  v_staff_id := upper(coalesce(nullif(new.raw_user_meta_data->>'staff_id',''), 'USR-'||left(replace(new.id::text,'-',''),8)));
  v_name := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1), 'New User');
  insert into public.profiles(id,staff_id,full_name,username,email,contact,position,role_id,status,must_change_password)
  values(new.id,v_staff_id,v_name,v_username,coalesce(new.email,''),new.raw_user_meta_data->>'contact',coalesce(new.raw_user_meta_data->>'position','Clinic Staff'),v_role,'ACTIVE',coalesce((new.raw_user_meta_data->>'must_change_password')::boolean,false))
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- Updated-at triggers.
do $$
declare t text;
begin
  foreach t in array array['roles','profiles','students','guardians','patient_medical_history','visits','consultations','vital_signs','medicines'] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I',t,t);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()',t,t);
  end loop;
end $$;

create or replace function public.set_actor_columns()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name='students' then
    if tg_op='INSERT' then new.created_by=coalesce(new.created_by,auth.uid()); end if;
    new.updated_by=auth.uid();
  elsif tg_table_name='patient_medical_history' then
    if tg_op='INSERT' then new.created_by=coalesce(new.created_by,auth.uid()); end if;
    new.updated_by=auth.uid();
  elsif tg_table_name='visits' then
    if tg_op='INSERT' then new.registered_by=coalesce(new.registered_by,auth.uid()); end if;
    new.updated_by=auth.uid();
  elsif tg_table_name='consultations' then
    if tg_op='INSERT' then new.staff_id=coalesce(new.staff_id,auth.uid()); end if;
    new.updated_by=auth.uid();
  elsif tg_table_name='medicines' then
    if tg_op='INSERT' then new.created_by=coalesce(new.created_by,auth.uid()); end if;
    new.updated_by=auth.uid();
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['students','patient_medical_history','visits','consultations','medicines'] loop
    execute format('drop trigger if exists %I_set_actor on public.%I',t,t);
    execute format('create trigger %I_set_actor before insert or update on public.%I for each row execute function public.set_actor_columns()',t,t);
  end loop;
end $$;

create or replace function public.audit_table_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_action text; v_description text; v_id uuid;
begin
  v_id := coalesce(new.id,old.id);
  v_action := case tg_table_name
    when 'students' then case tg_op when 'INSERT' then 'CREATE_PATIENT' else 'UPDATE_PATIENT' end
    when 'visits' then case tg_op when 'INSERT' then 'CREATE_VISIT' else 'UPDATE_VISIT' end
    when 'consultations' then case tg_op when 'INSERT' then 'CREATE_CONSULTATION' else 'UPDATE_CONSULTATION' end
    when 'medicines' then case tg_op when 'INSERT' then 'ADD_MEDICINE' else 'UPDATE_MEDICINE' end
    when 'system_settings' then 'CHANGE_SETTINGS'
    else upper(tg_op||'_'||tg_table_name) end;
  v_description := case tg_table_name
    when 'students' then case tg_op when 'INSERT' then 'Registered student patient '||new.student_id else 'Updated student patient '||new.student_id end
    when 'visits' then case tg_op when 'INSERT' then 'Registered clinic visit '||new.visit_id else 'Updated clinic visit '||new.visit_id end
    when 'consultations' then case tg_op when 'INSERT' then 'Created consultation '||new.consultation_id else 'Updated consultation '||new.consultation_id end
    when 'medicines' then case tg_op when 'INSERT' then 'Added medicine '||new.generic_name else 'Updated medicine '||new.generic_name end
    when 'system_settings' then 'Changed system setting '||new.key
    else initcap(tg_op)||' on '||tg_table_name end;
  perform public.audit_event(v_action,v_description,tg_table_name,v_id,jsonb_build_object('operation',tg_op));
  return coalesce(new,old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['students','visits','consultations','medicines'] loop
    execute format('drop trigger if exists %I_audit_change on public.%I',t,t);
    execute format('create trigger %I_audit_change after insert or update on public.%I for each row execute function public.audit_table_change()',t,t);
  end loop;
end $$;
drop trigger if exists system_settings_audit_change on public.system_settings;
create trigger system_settings_audit_change after insert or update on public.system_settings for each row execute function public.audit_table_change();

create or replace function public.visit_alert_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_student text;
begin
  if new.priority in ('Urgent','Emergency') and new.status in ('OPEN','IN_CONSULTATION') and (tg_op='INSERT' or old.priority is distinct from new.priority or old.status is distinct from new.status) then
    select student_id||' — '||first_name||' '||last_name into v_student from public.students where id=new.student_id;
    perform public.notify_permission('consultations.view','CRITICAL_VISIT',new.priority||' clinic visit',v_student||': '||new.complaint,'critical','/visits/'||new.id,'visit',new.id,now()+interval '2 days');
  elsif new.status in ('COMPLETED','CANCELLED') then
    update public.notifications set is_read=true,read_at=coalesce(read_at,now()) where source_entity_type='visit' and source_entity_id=new.id and not is_read;
  end if;
  return new;
end;
$$;
drop trigger if exists visits_alert on public.visits;
create trigger visits_alert after insert or update of priority,status on public.visits for each row execute function public.visit_alert_trigger();

create or replace function public.medicine_alert_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_status text; v_message text;
begin
  if not new.is_active then
    update public.notifications set is_read=true,read_at=coalesce(read_at,now()) where source_entity_type='medicine' and source_entity_id=new.id and not is_read;
    return new;
  end if;
  v_status := case
    when new.expiration_date is not null and new.expiration_date < current_date then 'EXPIRED_MEDICINE'
    when new.quantity<=0 then 'OUT_OF_STOCK'
    when new.quantity<=new.minimum_stock then 'LOW_STOCK'
    when new.expiration_date is not null and new.expiration_date<=current_date+30 then 'NEAR_EXPIRATION'
    else 'AVAILABLE' end;
  if v_status='AVAILABLE' then
    update public.notifications set is_read=true,read_at=coalesce(read_at,now()) where source_entity_type='medicine' and source_entity_id=new.id and not is_read;
  else
    v_message := new.generic_name||' — stock '||new.quantity||' '||new.unit||coalesce(', expires '||to_char(new.expiration_date,'Mon DD, YYYY'),'');
    perform public.notify_permission('medicines.view',v_status,replace(initcap(replace(v_status,'_',' ')),'Medicine','medicine'),v_message,
      case when v_status in ('EXPIRED_MEDICINE','OUT_OF_STOCK') then 'critical' else 'warning' end,
      '/medicines','medicine',new.id,now()+interval '30 days');
  end if;
  return new;
end;
$$;
drop trigger if exists medicines_stock_alert on public.medicines;
create trigger medicines_stock_alert after insert or update of quantity,minimum_stock,expiration_date,is_active on public.medicines for each row execute function public.medicine_alert_trigger();

-- RLS activation.
do $$
declare t text;
begin
  foreach t in array array['roles','permissions','role_permissions','profiles','students','guardians','student_guardians','patient_medical_history','immunizations','visits','consultations','vital_signs','medicine_categories','medicines','medicine_issuances','medicine_issuance_items','activity_logs','notifications','system_settings','login_attempts'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

-- Reference and staff directory policies.
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy profiles_read on public.profiles for select to authenticated using (true);
-- No direct profile writes: self updates use RPC; staff administration uses verified Edge Functions.

-- Patient-related policies.
create policy students_read on public.students for select to authenticated using (public.has_permission('patients.view'));
create policy students_insert on public.students for insert to authenticated with check (public.has_permission('patients.create') and created_by=auth.uid());
create policy students_update on public.students for update to authenticated using (public.has_permission('patients.update')) with check (public.has_permission('patients.update'));
create policy guardians_read on public.guardians for select to authenticated using (public.has_permission('patients.view'));
create policy guardians_insert on public.guardians for insert to authenticated with check (public.has_permission('patients.create') or public.has_permission('patients.update'));
create policy guardians_update on public.guardians for update to authenticated using (public.has_permission('patients.update')) with check (public.has_permission('patients.update'));
create policy student_guardians_read on public.student_guardians for select to authenticated using (public.has_permission('patients.view'));
create policy student_guardians_insert on public.student_guardians for insert to authenticated with check (public.has_permission('patients.create') or public.has_permission('patients.update'));
create policy student_guardians_update on public.student_guardians for update to authenticated using (public.has_permission('patients.update')) with check (public.has_permission('patients.update'));
create policy student_guardians_delete on public.student_guardians for delete to authenticated using (public.has_permission('patients.update'));
create policy medical_history_read on public.patient_medical_history for select to authenticated using (public.has_permission('patients.view'));
create policy medical_history_insert on public.patient_medical_history for insert to authenticated with check (public.has_permission('patients.create') or public.has_permission('patients.update'));
create policy medical_history_update on public.patient_medical_history for update to authenticated using (public.has_permission('patients.update')) with check (public.has_permission('patients.update'));
create policy immunizations_read on public.immunizations for select to authenticated using (public.has_permission('patients.view'));
create policy immunizations_insert on public.immunizations for insert to authenticated with check (public.has_permission('patients.update'));
create policy immunizations_update on public.immunizations for update to authenticated using (public.has_permission('patients.update')) with check (public.has_permission('patients.update'));
create policy immunizations_delete on public.immunizations for delete to authenticated using (public.has_permission('patients.update'));

-- Visit and consultation policies.
create policy visits_read on public.visits for select to authenticated using (public.has_permission('visits.view'));
create policy visits_insert on public.visits for insert to authenticated with check (public.has_permission('visits.create') and registered_by=auth.uid());
create policy visits_update on public.visits for update to authenticated using (public.has_permission('visits.update')) with check (public.has_permission('visits.update'));
create policy consultations_read on public.consultations for select to authenticated using (public.has_permission('consultations.view'));
create policy consultations_insert on public.consultations for insert to authenticated with check (public.has_permission('consultations.create') and staff_id=auth.uid());
create policy consultations_update on public.consultations for update to authenticated using (public.has_permission('consultations.update')) with check (public.has_permission('consultations.update'));
create policy vitals_read on public.vital_signs for select to authenticated using (public.has_permission('consultations.view'));
create policy vitals_insert on public.vital_signs for insert to authenticated with check (public.has_permission('consultations.create'));
create policy vitals_update on public.vital_signs for update to authenticated using (public.has_permission('consultations.update')) with check (public.has_permission('consultations.update'));

-- Medicine policies. Issuance writes are RPC-only.
create policy medicine_categories_read on public.medicine_categories for select to authenticated using (public.has_permission('medicines.view'));
create policy medicine_categories_manage on public.medicine_categories for all to authenticated using (public.has_permission('medicines.update')) with check (public.has_permission('medicines.update'));
create policy medicines_read on public.medicines for select to authenticated using (public.has_permission('medicines.view'));
create policy medicines_insert on public.medicines for insert to authenticated with check (public.has_permission('medicines.create'));
create policy medicines_update on public.medicines for update to authenticated using (public.has_permission('medicines.update')) with check (public.has_permission('medicines.update'));
create policy issuances_read on public.medicine_issuances for select to authenticated using (public.has_permission('issuance.view'));
create policy issuance_items_read on public.medicine_issuance_items for select to authenticated using (public.has_permission('issuance.view'));

-- Logs, notifications, and settings.
create policy activity_logs_read on public.activity_logs for select to authenticated using (public.has_permission('activity.view'));
create policy notifications_read_own on public.notifications for select to authenticated using (target_user_id=auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using (target_user_id=auth.uid()) with check (target_user_id=auth.uid());
create policy settings_read on public.system_settings for select to authenticated using (is_public or public.has_permission('settings.manage'));
-- System setting writes are RPC-only.
-- login_attempts has no client policies; only the service-role Edge Function can access it.

-- Security-invoker views preserve base-table RLS.
create or replace view public.profile_with_role with (security_invoker=on) as
select pr.id,pr.staff_id,pr.full_name,pr.username,pr.email,pr.contact,pr.position,pr.role_id,pr.status,
       pr.must_change_password,pr.last_login_at,pr.created_at,pr.updated_at,
       r.code as role_code,r.name as role_name,r.rank as role_rank,
       coalesce(array_agg(pe.code order by pe.code) filter (where pe.code is not null),'{}'::text[]) as permissions
from public.profiles pr
join public.roles r on r.id=pr.role_id
left join public.role_permissions rp on rp.role_id=r.id
left join public.permissions pe on pe.id=rp.permission_id
group by pr.id,r.id;

create or replace view public.staff_directory with (security_invoker=on) as
select pr.id,pr.staff_id,pr.full_name,pr.username,pr.email,pr.contact,pr.position,pr.role_id,pr.status,
       pr.must_change_password,pr.last_login_at,pr.created_at,pr.updated_at,r.code as role_code,r.name as role_name,r.rank as role_rank
from public.profiles pr join public.roles r on r.id=pr.role_id;

create or replace view public.student_directory with (security_invoker=on) as
select s.id,s.student_id,s.student_number,s.first_name,s.middle_name,s.last_name,s.suffix,
       trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name,s.suffix)) as full_name,
       s.birth_date,s.sex,s.grade_level,s.section,s.address,s.contact_number,s.email,s.status,s.created_at,s.updated_at,
       (select max(v.visit_date) from public.visits v where v.student_id=s.id and v.status<>'CANCELLED') as last_visit,
       (select count(*)::integer from public.visits v where v.student_id=s.id and v.status<>'CANCELLED') as total_visits
from public.students s where s.status<>'ARCHIVED';

create or replace view public.student_record with (security_invoker=on) as
select s.id,s.student_id,s.student_number,s.first_name,s.middle_name,s.last_name,s.suffix,
       trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name,s.suffix)) as full_name,
       s.birth_date,s.sex,s.grade_level,s.section,s.address,s.contact_number,s.email,s.status,s.created_at,s.updated_at,
       coalesce((select jsonb_build_object('id',g.id,'full_name',g.full_name,'relationship',g.relationship,'contact_number',g.contact_number,'email',g.email,'address',g.address)
         from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id
         where sg.student_id=s.id order by sg.is_primary desc,sg.is_emergency_contact desc limit 1),'{}'::jsonb) as guardian,
       coalesce((select to_jsonb(mh)-'id'-'student_id'-'created_by'-'updated_by'-'created_at'-'updated_at' from public.patient_medical_history mh where mh.student_id=s.id),'{}'::jsonb) as medical,
       (select count(*)::integer from public.visits v where v.student_id=s.id and v.status<>'CANCELLED') as total_visits,
       (select max(v.visit_date) from public.visits v where v.student_id=s.id and v.status<>'CANCELLED') as last_visit,
       (select max(c.created_at) from public.consultations c where c.student_id=s.id) as last_consultation,
       (select v.complaint from public.visits v where v.student_id=s.id and v.status<>'CANCELLED' group by v.complaint order by count(*) desc,max(v.visit_date) desc limit 1) as most_common_complaint
from public.students s where s.status<>'ARCHIVED';

create or replace view public.visit_history_view with (security_invoker=on) as
select v.id,v.visit_id,v.student_id,s.student_id as student_code,s.student_number,
       trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name,s.suffix)) as student_name,s.grade_level,s.section,
       v.visit_date,v.visit_time,v.visit_type,v.reason_for_visit,v.complaint,v.accompanied_by,v.priority,v.notes,v.status,
       v.registered_by,pr.full_name as staff_name,c.id as consultation_id,c.diagnosis,c.treatment_provided as treatment,
       v.created_at,v.updated_at
from public.visits v join public.students s on s.id=v.student_id
left join public.profiles pr on pr.id=v.registered_by
left join public.consultations c on c.visit_id=v.id;

create or replace view public.visit_detail with (security_invoker=on) as
select v.*,s.student_id as student_code,s.student_number,
       trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name,s.suffix)) as student_name,s.grade_level,s.section,s.birth_date,s.sex,
       pr.full_name as registered_by_name,c.id as consultation_id,c.consultation_id as consultation_code,c.diagnosis,c.severity,c.treatment_provided
from public.visits v join public.students s on s.id=v.student_id
left join public.profiles pr on pr.id=v.registered_by left join public.consultations c on c.visit_id=v.id;

create or replace view public.consultation_directory with (security_invoker=on) as
select c.id,c.consultation_id,c.visit_id,v.visit_id as visit_code,c.student_id,s.student_id as student_code,
       trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name,s.suffix)) as student_name,s.grade_level,s.section,
       c.staff_id,pr.full_name as staff_name,c.consultation_date,c.consultation_time,c.chief_complaint,c.symptoms,c.diagnosis,c.severity,c.treatment_provided,c.status,c.created_at,c.updated_at
from public.consultations c join public.visits v on v.id=c.visit_id join public.students s on s.id=c.student_id join public.profiles pr on pr.id=c.staff_id;

create or replace view public.consultation_detail with (security_invoker=on) as
select c.*,v.visit_id as visit_code,s.student_id as student_code,
       trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name,s.suffix)) as student_name,s.grade_level,s.section,s.birth_date,s.sex,
       pr.full_name as staff_name,
       coalesce((select to_jsonb(vs)-'id'-'consultation_id'-'created_at'-'updated_at' from public.vital_signs vs where vs.consultation_id=c.id),'{}'::jsonb) as vitals
from public.consultations c join public.visits v on v.id=c.visit_id join public.students s on s.id=c.student_id join public.profiles pr on pr.id=c.staff_id;

create or replace view public.medicine_inventory_view with (security_invoker=on) as
select m.*,mc.name as category_name,
  case when m.expiration_date is not null and m.expiration_date<current_date then 'Expired'
       when m.quantity<=0 then 'Out of Stock'
       when m.quantity<=m.minimum_stock then 'Low Stock'
       when m.expiration_date is not null and m.expiration_date<=current_date+30 then 'Near Expiration'
       else 'Available' end as computed_status,
  case when m.expiration_date is null then null else m.expiration_date-current_date end as days_to_expiration
from public.medicines m join public.medicine_categories mc on mc.id=m.category_id where m.is_active;

create or replace view public.medicine_issuance_history with (security_invoker=on) as
select mi.id,mi.issuance_id,mi.student_id,s.student_id as student_code,
       trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name,s.suffix)) as student_name,
       mi.visit_id,v.visit_id as visit_code,mi.issued_by,pr.full_name as issued_by_name,mi.issued_at,mi.issued_at::date as issued_date,
       mi.instructions,mi.notes,mi.status,mi.void_reason,mi.voided_by,mi.voided_at,
       string_agg(ii.medicine_name||coalesce(' '||ii.strength,'')||' × '||ii.quantity||' '||ii.unit, E'\n' order by ii.created_at) as medicine_summary,
       sum(ii.quantity)::integer as total_quantity
from public.medicine_issuances mi join public.students s on s.id=mi.student_id
join public.profiles pr on pr.id=mi.issued_by left join public.visits v on v.id=mi.visit_id
join public.medicine_issuance_items ii on ii.issuance_id=mi.id
group by mi.id,s.id,pr.id,v.id;

create or replace view public.activity_feed with (security_invoker=on) as
select a.*,pr.full_name as actor_name,r.name as actor_role
from public.activity_logs a left join public.profiles pr on pr.id=a.user_id left join public.roles r on r.id=pr.role_id;

-- Grants. RLS remains the enforcement layer.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.roles,public.permissions,public.role_permissions,public.profiles,public.students,public.guardians,public.student_guardians,
  public.patient_medical_history,public.immunizations,public.visits,public.consultations,public.vital_signs,public.medicine_categories,public.medicines,
  public.medicine_issuances,public.medicine_issuance_items,public.activity_logs,public.notifications,public.system_settings to authenticated;
grant insert,update on public.students,public.guardians,public.student_guardians,public.patient_medical_history,public.immunizations,public.visits,public.consultations,
  public.vital_signs,public.medicine_categories,public.medicines,public.notifications to authenticated;
grant delete on public.student_guardians,public.immunizations to authenticated;
grant select on public.profile_with_role,public.staff_directory,public.student_directory,public.student_record,public.visit_history_view,public.visit_detail,
  public.consultation_directory,public.consultation_detail,public.medicine_inventory_view,public.medicine_issuance_history,public.activity_feed to authenticated;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to authenticated,service_role;

revoke insert,update,delete on public.activity_logs from anon,authenticated;
revoke insert,update,delete on public.medicine_issuances,public.medicine_issuance_items from anon,authenticated;
revoke insert,update,delete on public.login_attempts from anon,authenticated;
revoke insert,update,delete on public.profiles from anon,authenticated;
revoke insert,update,delete on public.system_settings from anon,authenticated;

grant execute on function public.current_role_code() to authenticated;
grant execute on function public.current_role_rank() to authenticated;
grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.audit_event(text,text,text,uuid,jsonb) to authenticated;

-- Public clinic asset bucket. Upload/change is restricted to settings managers.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('clinic-assets','clinic-assets',true,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists clinic_assets_public_read on storage.objects;
create policy clinic_assets_public_read on storage.objects for select to public using (bucket_id='clinic-assets');
drop policy if exists clinic_assets_insert on storage.objects;
create policy clinic_assets_insert on storage.objects for insert to authenticated with check (bucket_id='clinic-assets' and public.has_permission('settings.manage'));
drop policy if exists clinic_assets_update on storage.objects;
create policy clinic_assets_update on storage.objects for update to authenticated using (bucket_id='clinic-assets' and public.has_permission('settings.manage')) with check (bucket_id='clinic-assets' and public.has_permission('settings.manage'));
drop policy if exists clinic_assets_delete on storage.objects;
create policy clinic_assets_delete on storage.objects for delete to authenticated using (bucket_id='clinic-assets' and public.has_permission('settings.manage'));
