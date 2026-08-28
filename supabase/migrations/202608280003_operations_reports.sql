-- Migration 003: transactional RPCs, reporting functions, and account/settings operations.

create or replace function public.upsert_student_record(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_guardian jsonb := coalesce(p_payload->'guardian','{}'::jsonb);
  v_medical jsonb := coalesce(p_payload->'medical','{}'::jsonb);
  v_guardian_id uuid;
  v_existing boolean := v_id is not null;
begin
  if v_id is null then
    perform public.require_permission('patients.create');
    insert into public.students(student_id,student_number,first_name,middle_name,last_name,suffix,birth_date,sex,grade_level,section,address,contact_number,email,status,created_by,updated_by)
    values(
      upper(trim(p_payload->>'student_id')),nullif(trim(p_payload->>'student_number'),''),trim(p_payload->>'first_name'),nullif(trim(p_payload->>'middle_name'),''),trim(p_payload->>'last_name'),nullif(trim(p_payload->>'suffix'),''),
      (p_payload->>'birth_date')::date,p_payload->>'sex',trim(p_payload->>'grade_level'),trim(p_payload->>'section'),nullif(trim(p_payload->>'address'),''),nullif(trim(p_payload->>'contact_number'),''),nullif(lower(trim(p_payload->>'email')),''),
      coalesce(nullif(p_payload->>'status',''),'ACTIVE'),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    perform public.require_permission('patients.update');
    if not exists(select 1 from public.students where id=v_id) then raise exception 'Patient record not found' using errcode='P0002'; end if;
    update public.students set
      student_id=upper(trim(p_payload->>'student_id')),student_number=nullif(trim(p_payload->>'student_number'),''),first_name=trim(p_payload->>'first_name'),middle_name=nullif(trim(p_payload->>'middle_name'),''),
      last_name=trim(p_payload->>'last_name'),suffix=nullif(trim(p_payload->>'suffix'),''),birth_date=(p_payload->>'birth_date')::date,sex=p_payload->>'sex',grade_level=trim(p_payload->>'grade_level'),section=trim(p_payload->>'section'),
      address=nullif(trim(p_payload->>'address'),''),contact_number=nullif(trim(p_payload->>'contact_number'),''),email=nullif(lower(trim(p_payload->>'email')),''),status=coalesce(nullif(p_payload->>'status',''),'ACTIVE'),updated_by=auth.uid()
    where id=v_id;
  end if;

  if nullif(trim(v_guardian->>'full_name'),'') is not null then
    select sg.guardian_id into v_guardian_id from public.student_guardians sg where sg.student_id=v_id order by sg.is_primary desc limit 1;
    if v_guardian_id is null then
      insert into public.guardians(full_name,relationship,contact_number,email,address)
      values(trim(v_guardian->>'full_name'),coalesce(nullif(trim(v_guardian->>'relationship'),''),'Guardian'),nullif(trim(v_guardian->>'contact_number'),''),nullif(lower(trim(v_guardian->>'email')),''),nullif(trim(v_guardian->>'address'),''))
      returning id into v_guardian_id;
      insert into public.student_guardians(student_id,guardian_id,is_primary,is_emergency_contact) values(v_id,v_guardian_id,true,true);
    else
      update public.guardians set full_name=trim(v_guardian->>'full_name'),relationship=coalesce(nullif(trim(v_guardian->>'relationship'),''),'Guardian'),
        contact_number=nullif(trim(v_guardian->>'contact_number'),''),email=nullif(lower(trim(v_guardian->>'email')),''),address=nullif(trim(v_guardian->>'address'),'') where id=v_guardian_id;
    end if;
  end if;

  insert into public.patient_medical_history(student_id,blood_type,allergies,existing_conditions,current_medications,medical_history,immunization_information,medical_alerts,created_by,updated_by)
  values(v_id,nullif(v_medical->>'blood_type',''),nullif(trim(v_medical->>'allergies'),''),nullif(trim(v_medical->>'existing_conditions'),''),nullif(trim(v_medical->>'current_medications'),''),
    nullif(trim(v_medical->>'medical_history'),''),nullif(trim(v_medical->>'immunization_information'),''),nullif(trim(v_medical->>'medical_alerts'),''),auth.uid(),auth.uid())
  on conflict(student_id) do update set blood_type=excluded.blood_type,allergies=excluded.allergies,existing_conditions=excluded.existing_conditions,
    current_medications=excluded.current_medications,medical_history=excluded.medical_history,immunization_information=excluded.immunization_information,medical_alerts=excluded.medical_alerts,updated_by=auth.uid();

  if not v_existing then
    perform public.notify_permission('patients.view','NEW_PATIENT','New student patient registered',
      upper(trim(p_payload->>'student_id'))||' — '||trim(p_payload->>'first_name')||' '||trim(p_payload->>'last_name'),
      'info','/patients/'||v_id,'student',v_id,now()+interval '7 days');
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Student ID, student number, username, or email already exists' using errcode='23505';
end;
$$;

create or replace function public.archive_student(p_student_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_code text;
begin
  perform public.require_permission('patients.delete');
  select student_id into v_code from public.students where id=p_student_id for update;
  if v_code is null then raise exception 'Patient record not found' using errcode='P0002'; end if;
  update public.students set status='ARCHIVED',updated_by=auth.uid() where id=p_student_id;
  perform public.audit_event('ARCHIVE_PATIENT','Archived student patient '||v_code,'students',p_student_id);
  return true;
end;
$$;

create or replace function public.archive_medicine(p_medicine_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_name text;
begin
  perform public.require_permission('medicines.delete');
  select generic_name into v_name from public.medicines where id=p_medicine_id for update;
  if v_name is null then raise exception 'Medicine not found' using errcode='P0002'; end if;
  update public.medicines set is_active=false,updated_by=auth.uid() where id=p_medicine_id;
  perform public.audit_event('DELETE_MEDICINE','Archived medicine '||v_name,'medicines',p_medicine_id);
  return true;
end;
$$;

create or replace function public.save_consultation(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_visit_id uuid := nullif(p_payload->>'visit_id','')::uuid;
  v_student_id uuid;
  v_vitals jsonb := coalesce(p_payload->'vitals','{}'::jsonb);
  v_is_new boolean := v_id is null;
begin
  if v_is_new then perform public.require_permission('consultations.create'); else perform public.require_permission('consultations.update'); end if;
  if v_is_new then
    select student_id into v_student_id from public.visits where id=v_visit_id and status<>'CANCELLED' for update;
    if v_student_id is null then raise exception 'Open visit not found' using errcode='P0002'; end if;
    if exists(select 1 from public.consultations where visit_id=v_visit_id) then raise exception 'This visit already has a consultation'; end if;
    insert into public.consultations(visit_id,student_id,staff_id,consultation_date,consultation_time,chief_complaint,symptoms,general_appearance,heent,respiratory,cardiovascular,abdomen,musculoskeletal,skin,neurological,diagnosis,findings,severity,treatment_provided,medicine_plan,dosage,frequency,duration,recommendations,medical_notes,status,updated_by)
    values(v_visit_id,v_student_id,auth.uid(),coalesce(nullif(p_payload->>'consultation_date','')::date,current_date),coalesce(nullif(p_payload->>'consultation_time','')::time,localtime),trim(p_payload->>'chief_complaint'),nullif(trim(p_payload->>'symptoms'),''),
      nullif(trim(p_payload->>'general_appearance'),''),nullif(trim(p_payload->>'heent'),''),nullif(trim(p_payload->>'respiratory'),''),nullif(trim(p_payload->>'cardiovascular'),''),nullif(trim(p_payload->>'abdomen'),''),nullif(trim(p_payload->>'musculoskeletal'),''),nullif(trim(p_payload->>'skin'),''),nullif(trim(p_payload->>'neurological'),''),
      trim(p_payload->>'diagnosis'),nullif(trim(p_payload->>'findings'),''),coalesce(nullif(p_payload->>'severity',''),'Mild'),nullif(trim(p_payload->>'treatment_provided'),''),nullif(trim(p_payload->>'medicine_plan'),''),nullif(trim(p_payload->>'dosage'),''),nullif(trim(p_payload->>'frequency'),''),nullif(trim(p_payload->>'duration'),''),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'recommendations','[]'::jsonb))),'{}'::text[]),nullif(trim(p_payload->>'medical_notes'),''),coalesce(nullif(p_payload->>'status',''),'COMPLETED'),auth.uid()) returning id into v_id;
  else
    select visit_id,student_id into v_visit_id,v_student_id from public.consultations where id=v_id for update;
    if v_visit_id is null then raise exception 'Consultation not found' using errcode='P0002'; end if;
    update public.consultations set consultation_date=coalesce(nullif(p_payload->>'consultation_date','')::date,consultation_date),consultation_time=coalesce(nullif(p_payload->>'consultation_time','')::time,consultation_time),
      chief_complaint=trim(p_payload->>'chief_complaint'),symptoms=nullif(trim(p_payload->>'symptoms'),''),general_appearance=nullif(trim(p_payload->>'general_appearance'),''),heent=nullif(trim(p_payload->>'heent'),''),respiratory=nullif(trim(p_payload->>'respiratory'),''),
      cardiovascular=nullif(trim(p_payload->>'cardiovascular'),''),abdomen=nullif(trim(p_payload->>'abdomen'),''),musculoskeletal=nullif(trim(p_payload->>'musculoskeletal'),''),skin=nullif(trim(p_payload->>'skin'),''),neurological=nullif(trim(p_payload->>'neurological'),''),
      diagnosis=trim(p_payload->>'diagnosis'),findings=nullif(trim(p_payload->>'findings'),''),severity=coalesce(nullif(p_payload->>'severity',''),'Mild'),treatment_provided=nullif(trim(p_payload->>'treatment_provided'),''),medicine_plan=nullif(trim(p_payload->>'medicine_plan'),''),
      dosage=nullif(trim(p_payload->>'dosage'),''),frequency=nullif(trim(p_payload->>'frequency'),''),duration=nullif(trim(p_payload->>'duration'),''),recommendations=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'recommendations','[]'::jsonb))),'{}'::text[]),
      medical_notes=nullif(trim(p_payload->>'medical_notes'),''),status=case when status='COMPLETED' then 'AMENDED' else coalesce(nullif(p_payload->>'status',''),status) end,updated_by=auth.uid() where id=v_id;
  end if;

  insert into public.vital_signs(consultation_id,temperature,systolic_bp,diastolic_bp,heart_rate,respiratory_rate,oxygen_saturation,weight,height)
  values(v_id,nullif(v_vitals->>'temperature','')::numeric,nullif(v_vitals->>'systolic_bp','')::integer,nullif(v_vitals->>'diastolic_bp','')::integer,nullif(v_vitals->>'heart_rate','')::integer,
    nullif(v_vitals->>'respiratory_rate','')::integer,nullif(v_vitals->>'oxygen_saturation','')::numeric,nullif(v_vitals->>'weight','')::numeric,nullif(v_vitals->>'height','')::numeric)
  on conflict(consultation_id) do update set temperature=excluded.temperature,systolic_bp=excluded.systolic_bp,diastolic_bp=excluded.diastolic_bp,heart_rate=excluded.heart_rate,
    respiratory_rate=excluded.respiratory_rate,oxygen_saturation=excluded.oxygen_saturation,weight=excluded.weight,height=excluded.height;

  update public.visits set status='COMPLETED',updated_by=auth.uid() where id=v_visit_id;
  if coalesce(p_payload->>'severity','Mild') in ('Severe','Critical') then
    perform public.notify_permission('dashboard.view','FLAGGED_CASE',coalesce(p_payload->>'severity','Critical')||' consultation case',trim(p_payload->>'diagnosis'),'critical','/consultations/'||v_id,'consultation',v_id,now()+interval '7 days');
  end if;
  return v_id;
end;
$$;

create or replace function public.issue_medicine(
  p_student_id uuid,
  p_visit_id uuid,
  p_items jsonb,
  p_instructions text default null,
  p_notes text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_issuance_id uuid;
  v_item jsonb;
  v_medicine_id uuid;
  v_quantity integer;
  v_med public.medicines%rowtype;
  v_student_code text;
  v_item_count integer := 0;
begin
  perform public.require_permission('issuance.create');
  select student_id into v_student_code from public.students where id=p_student_id and status='ACTIVE';
  if v_student_code is null then raise exception 'Active patient not found' using errcode='P0002'; end if;
  if p_visit_id is not null and not exists(select 1 from public.visits where id=p_visit_id and student_id=p_student_id and status<>'CANCELLED') then
    raise exception 'The selected visit does not belong to this patient';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one medicine item is required'; end if;

  insert into public.medicine_issuances(student_id,visit_id,issued_by,instructions,notes)
  values(p_student_id,p_visit_id,auth.uid(),nullif(trim(p_instructions),''),nullif(trim(p_notes),'')) returning id into v_issuance_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_medicine_id := nullif(v_item->>'medicine_id','')::uuid;
    v_quantity := nullif(v_item->>'quantity','')::integer;
    if v_medicine_id is null or v_quantity is null or v_quantity<=0 then raise exception 'Every issuance item requires a medicine and positive quantity'; end if;
    select * into v_med from public.medicines where id=v_medicine_id for update;
    if not found or not v_med.is_active then raise exception 'Medicine is unavailable'; end if;
    if v_med.expiration_date is not null and v_med.expiration_date<current_date then raise exception 'Expired medicine cannot be issued: %',v_med.generic_name; end if;
    if v_med.quantity<v_quantity then raise exception 'Insufficient stock for %. Available: %, requested: %',v_med.generic_name,v_med.quantity,v_quantity; end if;

    insert into public.medicine_issuance_items(issuance_id,medicine_id,medicine_name,strength,dosage_form,unit,quantity,dosage,frequency,duration,instructions,expiration_date_snapshot,batch_number_snapshot)
    values(v_issuance_id,v_med.id,v_med.generic_name,v_med.strength,v_med.dosage_form,v_med.unit,v_quantity,nullif(trim(v_item->>'dosage'),''),nullif(trim(v_item->>'frequency'),''),nullif(trim(v_item->>'duration'),''),nullif(trim(v_item->>'instructions'),''),v_med.expiration_date,v_med.batch_number);
    update public.medicines set quantity=quantity-v_quantity,updated_by=auth.uid() where id=v_med.id;
    v_item_count := v_item_count+1;
  end loop;

  perform public.audit_event('ISSUE_MEDICINE','Issued '||v_item_count||' medicine item(s) to patient '||v_student_code,'medicine_issuances',v_issuance_id,jsonb_build_object('student_id',p_student_id,'item_count',v_item_count));
  return v_issuance_id;
end;
$$;

create or replace function public.void_medicine_issuance(p_issuance_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_issuance public.medicine_issuances%rowtype; v_item record;
begin
  perform public.require_permission('issuance.void');
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'A clear void reason is required'; end if;
  select * into v_issuance from public.medicine_issuances where id=p_issuance_id for update;
  if not found then raise exception 'Issuance not found' using errcode='P0002'; end if;
  if v_issuance.status<>'COMPLETED' then raise exception 'Only completed issuances may be voided'; end if;
  for v_item in select medicine_id,quantity from public.medicine_issuance_items where issuance_id=p_issuance_id loop
    perform 1 from public.medicines where id=v_item.medicine_id for update;
    update public.medicines set quantity=quantity+v_item.quantity,updated_by=auth.uid() where id=v_item.medicine_id;
  end loop;
  update public.medicine_issuances set status='VOIDED',void_reason=trim(p_reason),voided_by=auth.uid(),voided_at=now() where id=p_issuance_id;
  perform public.audit_event('VOID_MEDICINE_ISSUANCE','Voided medicine issuance '||v_issuance.issuance_id||' and restored stock','medicine_issuances',p_issuance_id,jsonb_build_object('reason',trim(p_reason)));
  return true;
end;
$$;

create or replace function public.student_filter_options()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_permission('patients.view');
  return jsonb_build_object(
    'grades',coalesce((select jsonb_agg(x.grade_level order by x.grade_level) from (select distinct grade_level from public.students where status<>'ARCHIVED') x),'[]'::jsonb),
    'sections',coalesce((select jsonb_agg(x.section order by x.section) from (select distinct section from public.students where status<>'ARCHIVED') x),'[]'::jsonb)
  );
end;
$$;

create or replace function public.dashboard_summary()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_permission('dashboard.view');
  return jsonb_build_object(
    'total_students',(select count(*) from public.students where status='ACTIVE'),
    'visits_today',(select count(*) from public.visits where visit_date=current_date and status<>'CANCELLED'),
    'patients_seen_today',(select count(distinct student_id) from public.visits where visit_date=current_date and status<>'CANCELLED'),
    'pending_consultations',(select count(*) from public.visits v where v.status in ('OPEN','IN_CONSULTATION') and not exists(select 1 from public.consultations c where c.visit_id=v.id)),
    'low_stock_medicines',(select count(*) from public.medicines where is_active and quantity<=minimum_stock and (expiration_date is null or expiration_date>=current_date)),
    'critical_cases',(select count(*) from public.visits where priority in ('Urgent','Emergency') and status in ('OPEN','IN_CONSULTATION')) + (select count(*) from public.consultations where severity in ('Severe','Critical') and consultation_date>=current_date-7)
  );
end;
$$;

create or replace function public.visit_analytics(p_period text default 'monthly',p_date_from date default null,p_date_to date default null)
returns table(label text,period_start date,visits bigint) language plpgsql security definer set search_path = public, pg_temp as $$
declare v_from date; v_to date; v_step interval; v_trunc text; v_format text;
begin
  perform public.require_permission('dashboard.view');
  v_to:=coalesce(p_date_to,current_date);
  if lower(p_period)='daily' then v_from:=coalesce(p_date_from,v_to-13);v_step:='1 day';v_trunc:='day';v_format:='Mon DD';
  elsif lower(p_period)='weekly' then v_from:=coalesce(p_date_from,(date_trunc('week',v_to)::date-interval '11 weeks')::date);v_step:='1 week';v_trunc:='week';v_format:='Mon DD';
  elsif lower(p_period)='yearly' then v_from:=coalesce(p_date_from,(date_trunc('year',v_to)::date-interval '4 years')::date);v_step:='1 year';v_trunc:='year';v_format:='YYYY';
  else v_from:=coalesce(p_date_from,(date_trunc('month',v_to)::date-interval '11 months')::date);v_step:='1 month';v_trunc:='month';v_format:='Mon YYYY'; end if;
  return query with periods as (select generate_series(date_trunc(v_trunc,v_from::timestamp),date_trunc(v_trunc,v_to::timestamp),v_step)::date d)
    select to_char(p.d,v_format),p.d,count(v.id) from periods p left join public.visits v on date_trunc(v_trunc,v.visit_date)::date=p.d and v.status<>'CANCELLED' group by p.d order by p.d;
end;
$$;

create or replace function public.common_complaints(p_limit integer default 8,p_date_from date default null,p_date_to date default null)
returns table(complaint text,count bigint) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_permission('dashboard.view');
  return query select coalesce(nullif(trim(v.complaint),''),'Unspecified'),count(*) from public.visits v
    where v.status<>'CANCELLED' and (p_date_from is null or v.visit_date>=p_date_from) and (p_date_to is null or v.visit_date<=p_date_to)
    group by 1 order by 2 desc,1 limit greatest(1,least(coalesce(p_limit,8),50));
end;
$$;

create or replace function public.medicine_usage_report(p_limit integer default 8,p_date_from date default null,p_date_to date default null)
returns table(medicine text,quantity bigint) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_permission('dashboard.view');
  return query select ii.medicine_name,sum(ii.quantity) from public.medicine_issuance_items ii join public.medicine_issuances mi on mi.id=ii.issuance_id
    where mi.status='COMPLETED' and (p_date_from is null or mi.issued_at::date>=p_date_from) and (p_date_to is null or mi.issued_at::date<=p_date_to)
    group by ii.medicine_name order by sum(ii.quantity) desc,ii.medicine_name limit greatest(1,least(coalesce(p_limit,8),50));
end;
$$;

create or replace function public.generate_report(
  p_date_from date default null,p_date_to date default null,p_grade text default null,p_section text default null,
  p_visit_type text default null,p_diagnosis text default null,p_staff_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  perform public.require_permission('reports.view');
  with fv as (
    select v.id,v.visit_id,v.visit_date,v.visit_time,v.student_id,v.visit_type,v.complaint,v.reason_for_visit,v.priority,v.status,
      s.student_id as student_code,trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name,s.suffix)) as student_name,s.grade_level,s.section,
      c.id as consultation_id,c.diagnosis,c.staff_id as consultation_staff_id,coalesce(cp.full_name,rp.full_name) as staff_name
    from public.visits v join public.students s on s.id=v.student_id left join public.consultations c on c.visit_id=v.id
    left join public.profiles cp on cp.id=c.staff_id left join public.profiles rp on rp.id=v.registered_by
    where v.status<>'CANCELLED'
      and (p_date_from is null or v.visit_date>=p_date_from) and (p_date_to is null or v.visit_date<=p_date_to)
      and (p_grade is null or p_grade='' or s.grade_level=p_grade) and (p_section is null or p_section='' or s.section=p_section)
      and (p_visit_type is null or p_visit_type='' or v.visit_type=p_visit_type)
      and (p_diagnosis is null or p_diagnosis='' or c.diagnosis ilike '%'||p_diagnosis||'%')
      and (p_staff_id is null or coalesce(c.staff_id,v.registered_by)=p_staff_id)
  ), filtered_students as (
    select s.* from public.students s where s.status='ACTIVE' and (p_grade is null or p_grade='' or s.grade_level=p_grade) and (p_section is null or p_section='' or s.section=p_section)
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'total_students',(select count(*) from filtered_students),
      'total_visits',(select count(*) from fv),
      'total_consultations',(select count(*) from fv where consultation_id is not null),
      'total_medicine_quantity',(select coalesce(sum(ii.quantity),0) from public.medicine_issuance_items ii join public.medicine_issuances mi on mi.id=ii.issuance_id join public.students s on s.id=mi.student_id where mi.status='COMPLETED' and (p_date_from is null or mi.issued_at::date>=p_date_from) and (p_date_to is null or mi.issued_at::date<=p_date_to) and (p_grade is null or p_grade='' or s.grade_level=p_grade) and (p_section is null or p_section='' or s.section=p_section))
    ),
    'visits_by_period',coalesce((select jsonb_agg(to_jsonb(x) order by x.period_start) from (select visit_date as period_start,to_char(visit_date,'Mon DD') as label,count(*) as visits from fv group by visit_date order by visit_date) x),'[]'::jsonb),
    'patients_by_grade',coalesce((select jsonb_agg(to_jsonb(x) order by x.grade) from (select grade_level as grade,count(*) as patients from filtered_students group by grade_level order by grade_level) x),'[]'::jsonb),
    'visits_by_complaint',coalesce((select jsonb_agg(to_jsonb(x) order by x.visits desc) from (select complaint,count(*) as visits from fv group by complaint order by count(*) desc limit 12) x),'[]'::jsonb),
    'visits_by_diagnosis',coalesce((select jsonb_agg(to_jsonb(x) order by x.visits desc) from (select coalesce(diagnosis,'Unspecified') diagnosis,count(*) as visits from fv where consultation_id is not null group by diagnosis order by count(*) desc limit 12) x),'[]'::jsonb),
    'medicine_usage',coalesce((select jsonb_agg(to_jsonb(x) order by x.quantity desc) from (select ii.medicine_name medicine,sum(ii.quantity) quantity from public.medicine_issuance_items ii join public.medicine_issuances mi on mi.id=ii.issuance_id join public.students s on s.id=mi.student_id where mi.status='COMPLETED' and (p_date_from is null or mi.issued_at::date>=p_date_from) and (p_date_to is null or mi.issued_at::date<=p_date_to) and (p_grade is null or p_grade='' or s.grade_level=p_grade) and (p_section is null or p_section='' or s.section=p_section) group by ii.medicine_name order by sum(ii.quantity) desc limit 12) x),'[]'::jsonb),
    'low_stock',coalesce((select jsonb_agg(to_jsonb(x) order by x.quantity) from (select id,generic_name,quantity,minimum_stock,unit from public.medicines where is_active and quantity<=minimum_stock and (expiration_date is null or expiration_date>=current_date)) x),'[]'::jsonb),
    'expired',coalesce((select jsonb_agg(to_jsonb(x) order by x.expiration_date) from (select id,generic_name,quantity,unit,expiration_date from public.medicines where is_active and expiration_date<current_date) x),'[]'::jsonb),
    'staff_activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.consultations_handled desc) from (select p.id staff_id,p.full_name staff_name,count(distinct fv.id) visits_handled,count(distinct fv.consultation_id) consultations_handled from public.profiles p left join fv on fv.consultation_staff_id=p.id where p.status='ACTIVE' group by p.id,p.full_name having count(distinct fv.id)>0 order by count(distinct fv.consultation_id) desc) x),'[]'::jsonb),
    'visit_rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.visit_date desc,x.visit_time desc) from (select id,visit_date,visit_time,visit_id,student_name,student_code,grade_level,section,visit_type,complaint,diagnosis,staff_name,priority,status from fv) x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_public_settings()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    return coalesce((select jsonb_object_agg(key,value) from public.system_settings where is_public),'{}'::jsonb);
  end if;
  return coalesce((select jsonb_object_agg(key,value) from public.system_settings where is_public or public.has_permission('settings.manage')),'{}'::jsonb);
end;
$$;

create or replace function public.update_system_settings(p_settings jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_key text; v_value jsonb;
begin
  perform public.require_permission('settings.manage');
  if jsonb_typeof(p_settings)<>'object' then raise exception 'Settings payload must be an object'; end if;
  for v_key,v_value in select key,value from jsonb_each(p_settings) loop
    if not exists(select 1 from public.system_settings where key=v_key) then raise exception 'Unknown setting: %',v_key; end if;
    update public.system_settings set value=v_value,updated_by=auth.uid(),updated_at=now() where key=v_key;
  end loop;
  return true;
end;
$$;

create or replace function public.update_my_profile(p_payload jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles set full_name=coalesce(nullif(trim(p_payload->>'full_name'),''),full_name),contact=nullif(trim(p_payload->>'contact'),''),position=coalesce(nullif(trim(p_payload->>'position'),''),position) where id=auth.uid();
  perform public.audit_event('UPDATE_PROFILE','Updated own staff profile','profiles',auth.uid());
  return true;
end;
$$;

create or replace function public.record_login()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return false; end if;
  update public.profiles set last_login_at=now(),last_login_ip=public.request_ip() where id=auth.uid() and status='ACTIVE';
  if not found then raise exception 'This account is disabled' using errcode='42501'; end if;
  perform public.audit_event('LOGIN','Signed in to School Clinic EMR','profiles',auth.uid());
  return true;
end;
$$;

create or replace function public.record_logout()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then perform public.audit_event('LOGOUT','Signed out of School Clinic EMR','profiles',auth.uid()); end if;
  return true;
end;
$$;

create or replace function public.clear_temporary_password_flag()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles set must_change_password=false where id=auth.uid();
  perform public.audit_event('CHANGE_PASSWORD','Changed account password','profiles',auth.uid());
  return true;
end;
$$;

-- Only authenticated callers receive application RPC privileges.
revoke all on function public.upsert_student_record(jsonb) from public;
revoke all on function public.archive_student(uuid) from public;
revoke all on function public.archive_medicine(uuid) from public;
revoke all on function public.save_consultation(jsonb) from public;
revoke all on function public.issue_medicine(uuid,uuid,jsonb,text,text) from public;
revoke all on function public.void_medicine_issuance(uuid,text) from public;
revoke all on function public.student_filter_options() from public;
revoke all on function public.dashboard_summary() from public;
revoke all on function public.visit_analytics(text,date,date) from public;
revoke all on function public.common_complaints(integer,date,date) from public;
revoke all on function public.medicine_usage_report(integer,date,date) from public;
revoke all on function public.generate_report(date,date,text,text,text,text,uuid) from public;
revoke all on function public.update_system_settings(jsonb) from public;
revoke all on function public.update_my_profile(jsonb) from public;
revoke all on function public.record_login() from public;
revoke all on function public.record_logout() from public;
revoke all on function public.clear_temporary_password_flag() from public;

grant execute on function public.upsert_student_record(jsonb),public.archive_student(uuid),public.archive_medicine(uuid),public.save_consultation(jsonb),
 public.issue_medicine(uuid,uuid,jsonb,text,text),public.void_medicine_issuance(uuid,text),public.student_filter_options(),public.dashboard_summary(),
 public.visit_analytics(text,date,date),public.common_complaints(integer,date,date),public.medicine_usage_report(integer,date,date),
 public.generate_report(date,date,text,text,text,text,uuid),public.get_public_settings(),public.update_system_settings(jsonb),public.update_my_profile(jsonb),
 public.record_login(),public.record_logout(),public.clear_temporary_password_flag() to authenticated;
grant execute on function public.get_public_settings() to anon;
