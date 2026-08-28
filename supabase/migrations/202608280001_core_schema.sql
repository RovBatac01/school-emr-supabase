-- School Clinic EMR for Supabase
-- Migration 001: extensions, normalized tables, constraints, indexes, and reference data.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create sequence if not exists public.visit_number_seq start 1001;
create sequence if not exists public.consultation_number_seq start 1001;
create sequence if not exists public.issuance_number_seq start 1001;
create sequence if not exists public.activity_number_seq start 1001;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  name text not null unique,
  description text,
  rank integer not null check (rank between 1 and 100),
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+\.[a-z_]+$'),
  name text not null,
  module text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  staff_id text not null unique,
  full_name text not null,
  username text not null,
  email text not null,
  contact text,
  position text not null default 'Clinic Staff',
  role_id uuid not null references public.roles(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  last_login_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
create unique index if not exists profiles_username_lower_uq on public.profiles (lower(username));
create unique index if not exists profiles_email_lower_uq on public.profiles (lower(email));
create index if not exists profiles_role_idx on public.profiles(role_id);
create index if not exists profiles_status_idx on public.profiles(status);
create index if not exists profiles_name_trgm_idx on public.profiles using gin(full_name gin_trgm_ops);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  student_id text not null unique,
  student_number text unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  suffix text,
  birth_date date not null check (birth_date <= current_date),
  sex text not null check (sex in ('Female','Male','Other','Prefer not to say')),
  grade_level text not null,
  section text not null,
  address text,
  contact_number text,
  email text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','GRADUATED','TRANSFERRED','ARCHIVED')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists students_student_id_idx on public.students(student_id);
create index if not exists students_student_number_idx on public.students(student_number);
create index if not exists students_grade_section_idx on public.students(grade_level, section);
create index if not exists students_status_idx on public.students(status);
create index if not exists students_name_trgm_idx on public.students using gin(((coalesce(first_name,'') || ' ' || coalesce(middle_name,'') || ' ' || coalesce(last_name,''))) gin_trgm_ops);

create table if not exists public.guardians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  relationship text not null,
  contact_number text,
  email text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  is_primary boolean not null default false,
  is_emergency_contact boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(student_id, guardian_id)
);
create unique index if not exists one_primary_guardian_per_student on public.student_guardians(student_id) where is_primary;

create table if not exists public.patient_medical_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  blood_type text check (blood_type is null or blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  allergies text,
  existing_conditions text,
  current_medications text,
  medical_history text,
  immunization_information text,
  medical_alerts text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.immunizations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  vaccine_name text not null,
  dose text,
  administered_date date,
  administered_by text,
  lot_number text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists immunizations_student_idx on public.immunizations(student_id, administered_date desc);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  visit_id text not null unique default ('VIS-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.visit_number_seq')::text,6,'0')),
  student_id uuid not null references public.students(id) on delete restrict,
  visit_date date not null default current_date,
  visit_time time not null default localtime,
  visit_type text not null check (visit_type in ('Walk-in','Follow-up','Emergency','Referral','Medical clearance','Other')),
  reason_for_visit text not null,
  complaint text not null,
  accompanied_by text,
  priority text not null default 'Normal' check (priority in ('Normal','Moderate','Urgent','Emergency')),
  notes text,
  status text not null default 'OPEN' check (status in ('OPEN','IN_CONSULTATION','COMPLETED','CANCELLED')),
  registered_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visits_student_date_idx on public.visits(student_id, visit_date desc, visit_time desc);
create index if not exists visits_date_idx on public.visits(visit_date desc);
create index if not exists visits_status_idx on public.visits(status);
create index if not exists visits_priority_idx on public.visits(priority);
create index if not exists visits_complaint_trgm_idx on public.visits using gin(complaint gin_trgm_ops);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  consultation_id text not null unique default ('CON-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.consultation_number_seq')::text,6,'0')),
  visit_id uuid not null unique references public.visits(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  staff_id uuid not null references public.profiles(id) on delete restrict,
  consultation_date date not null default current_date,
  consultation_time time not null default localtime,
  chief_complaint text not null,
  symptoms text,
  general_appearance text,
  heent text,
  respiratory text,
  cardiovascular text,
  abdomen text,
  musculoskeletal text,
  skin text,
  neurological text,
  diagnosis text not null,
  findings text,
  severity text not null default 'Mild' check (severity in ('Mild','Moderate','Severe','Critical')),
  treatment_provided text,
  medicine_plan text,
  dosage text,
  frequency text,
  duration text,
  recommendations text[] not null default '{}',
  medical_notes text,
  status text not null default 'COMPLETED' check (status in ('DRAFT','COMPLETED','AMENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists consultations_student_date_idx on public.consultations(student_id, consultation_date desc);
create index if not exists consultations_staff_date_idx on public.consultations(staff_id, consultation_date desc);
create index if not exists consultations_diagnosis_trgm_idx on public.consultations using gin(diagnosis gin_trgm_ops);

create table if not exists public.vital_signs (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultations(id) on delete cascade,
  temperature numeric(4,1) check (temperature is null or temperature between 30 and 45),
  systolic_bp integer check (systolic_bp is null or systolic_bp between 40 and 300),
  diastolic_bp integer check (diastolic_bp is null or diastolic_bp between 20 and 200),
  heart_rate integer check (heart_rate is null or heart_rate between 20 and 300),
  respiratory_rate integer check (respiratory_rate is null or respiratory_rate between 5 and 100),
  oxygen_saturation numeric(5,2) check (oxygen_saturation is null or oxygen_saturation between 50 and 100),
  weight numeric(7,2) check (weight is null or weight > 0),
  height numeric(7,2) check (height is null or height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medicine_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  medicine_id text not null unique,
  generic_name text not null,
  brand_name text,
  category_id uuid not null references public.medicine_categories(id) on delete restrict,
  dosage_form text not null,
  strength text,
  quantity integer not null default 0 check (quantity >= 0),
  unit text not null,
  minimum_stock integer not null default 10 check (minimum_stock >= 0),
  expiration_date date,
  supplier text,
  batch_number text,
  storage_location text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists medicines_category_idx on public.medicines(category_id);
create index if not exists medicines_stock_idx on public.medicines(quantity, minimum_stock);
create index if not exists medicines_expiration_idx on public.medicines(expiration_date);
create index if not exists medicines_name_trgm_idx on public.medicines using gin(((coalesce(generic_name,'') || ' ' || coalesce(brand_name,''))) gin_trgm_ops);

create table if not exists public.medicine_issuances (
  id uuid primary key default gen_random_uuid(),
  issuance_id text not null unique default ('ISS-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.issuance_number_seq')::text,6,'0')),
  student_id uuid not null references public.students(id) on delete restrict,
  visit_id uuid references public.visits(id) on delete restrict,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  instructions text,
  notes text,
  status text not null default 'COMPLETED' check (status in ('COMPLETED','VOIDED')),
  void_reason text,
  voided_by uuid references public.profiles(id) on delete restrict,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists medicine_issuances_student_idx on public.medicine_issuances(student_id, issued_at desc);
create index if not exists medicine_issuances_visit_idx on public.medicine_issuances(visit_id);
create index if not exists medicine_issuances_status_idx on public.medicine_issuances(status);

create table if not exists public.medicine_issuance_items (
  id uuid primary key default gen_random_uuid(),
  issuance_id uuid not null references public.medicine_issuances(id) on delete restrict,
  medicine_id uuid not null references public.medicines(id) on delete restrict,
  medicine_name text not null,
  strength text,
  dosage_form text,
  unit text not null,
  quantity integer not null check (quantity > 0),
  dosage text,
  frequency text,
  duration text,
  instructions text,
  expiration_date_snapshot date,
  batch_number_snapshot text,
  created_at timestamptz not null default now()
);
create index if not exists issuance_items_issuance_idx on public.medicine_issuance_items(issuance_id);
create index if not exists issuance_items_medicine_idx on public.medicine_issuance_items(medicine_id);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  activity_id text not null unique default ('ACT-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.activity_number_seq')::text,8,'0')),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  description text not null,
  entity_type text,
  entity_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_user_date_idx on public.activity_logs(user_id, created_at desc);
create index if not exists activity_logs_action_date_idx on public.activity_logs(action, created_at desc);
create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);
create index if not exists activity_logs_description_trgm_idx on public.activity_logs using gin(description gin_trgm_ops);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  link text,
  source_entity_type text,
  source_entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists notifications_user_read_idx on public.notifications(target_user_id, is_read, created_at desc);
create index if not exists notifications_expiry_idx on public.notifications(expires_at);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Used only by the username-login Edge Function. Service-role access only.
create table if not exists public.login_attempts (
  id bigint generated by default as identity primary key,
  identifier_hash text not null,
  ip_hash text,
  successful boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index if not exists login_attempts_identifier_time_idx on public.login_attempts(identifier_hash, attempted_at desc);

insert into public.roles(code,name,description,rank) values
('SUPER_ADMIN','Super Administrator','Full access to all system modules and administrators.',100),
('CLINIC_ADMIN','Clinic Administrator','Clinical and operational administration without super-administrator control.',80),
('CLINIC_STAFF','Clinic Staff / Nurse','Patient care, visits, consultations, medicine view and issuance.',50),
('VIEWER','Viewer / Staff','Read-only access to authorized medical information.',10)
on conflict (code) do update set name=excluded.name,description=excluded.description,rank=excluded.rank;

insert into public.permissions(code,name,module,description) values
('dashboard.view','View Dashboard','Dashboard','View clinic dashboard and operational metrics.'),
('patients.view','View Patients','Patients','Search and view patient records.'),
('patients.create','Create Patients','Patients','Register new student patients.'),
('patients.update','Update Patients','Patients','Update patient demographic and medical information.'),
('patients.delete','Archive Patients','Patients','Archive patient records when authorized.'),
('visits.view','View Visits','Visits','View clinic visit history.'),
('visits.create','Create Visits','Visits','Register clinic visits.'),
('visits.update','Update Visits','Visits','Update clinic visit records.'),
('consultations.view','View Consultations','Consultations','View consultation records.'),
('consultations.create','Create Consultations','Consultations','Create consultation and vital-sign records.'),
('consultations.update','Update Consultations','Consultations','Amend consultation records.'),
('medicines.view','View Medicines','Medicines','View inventory and alerts.'),
('medicines.create','Add Medicines','Medicines','Add inventory items.'),
('medicines.update','Update Medicines','Medicines','Update inventory details and quantities.'),
('medicines.delete','Archive Medicines','Medicines','Archive inventory items.'),
('issuance.view','View Issuance','Medicines','View medicine issuance history.'),
('issuance.create','Issue Medicines','Medicines','Issue medicines through the protected stock transaction.'),
('issuance.void','Void Issuance','Medicines','Void an issuance and restore inventory.'),
('staff.view','View Staff','Staff','View staff directory and account status.'),
('staff.create','Create Staff','Staff','Create staff authentication accounts.'),
('staff.update','Update Staff','Staff','Update or disable staff accounts.'),
('staff.reset_password','Reset Staff Password','Staff','Assign a temporary staff password.'),
('reports.view','View Reports','Reports','View and export clinic reports.'),
('activity.view','View Activity Logs','Activity','View the immutable audit trail.'),
('settings.view','View Settings','Settings','View account and clinic settings.'),
('settings.manage','Manage Settings','Settings','Change clinic and system settings.')
on conflict (code) do update set name=excluded.name,module=excluded.module,description=excluded.description;

-- Super Administrator receives all permissions.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where r.code='SUPER_ADMIN'
on conflict do nothing;

-- Clinic Administrator: all clinical/operational permissions, no super-admin account creation/deletion.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code = any(array[
'dashboard.view','patients.view','patients.create','patients.update','visits.view','visits.create','visits.update',
'consultations.view','consultations.create','consultations.update','medicines.view','medicines.create','medicines.update',
'issuance.view','issuance.create','issuance.void','reports.view','activity.view','settings.view','settings.manage','staff.view'
]) where r.code='CLINIC_ADMIN' on conflict do nothing;

-- Clinic Staff / Nurse.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code = any(array[
'dashboard.view','patients.view','visits.view','visits.create','visits.update','consultations.view','consultations.create',
'consultations.update','medicines.view','issuance.view','issuance.create','reports.view','settings.view'
]) where r.code='CLINIC_STAFF' on conflict do nothing;

-- Viewer.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code = any(array[
'dashboard.view','patients.view','visits.view','consultations.view','medicines.view','issuance.view','reports.view','settings.view'
]) where r.code='VIEWER' on conflict do nothing;

insert into public.medicine_categories(name,description) values
('Analgesic / Antipyretic','Pain and fever relief medicines.'),
('Antihistamine','Medicines for allergic symptoms.'),
('Cough and Cold','Symptomatic cough and cold medicines.'),
('Gastrointestinal','Medicines for stomach and digestive complaints.'),
('First Aid','Topical and immediate-care clinic supplies.'),
('Antiseptic','Skin and wound antiseptic preparations.'),
('Respiratory','Medicines supporting respiratory complaints.'),
('Other','Other clinic medicine and supply categories.')
on conflict (name) do nothing;

insert into public.system_settings(key,value,description,is_public) values
('school_name','"Demo Learning Academy"'::jsonb,'School name displayed in the EMR.',true),
('clinic_name','"School Health and Wellness Clinic"'::jsonb,'Clinic display name.',true),
('clinic_contact','"(046) 000-0000"'::jsonb,'Clinic contact number.',true),
('clinic_address','"Fictional Campus, General Trias, Cavite"'::jsonb,'Clinic address.',true),
('school_logo_url','""'::jsonb,'Public URL of the school logo in Supabase Storage.',true),
('near_expiration_days','30'::jsonb,'Days before expiry considered near expiration.',false),
('session_notice','"Authorized personnel only. All access is audited."'::jsonb,'Login/session notice.',true),
('system_version','"1.0.0-supabase"'::jsonb,'Application release version.',true)
on conflict (key) do update set value=excluded.value,description=excluded.description,is_public=excluded.is_public;
