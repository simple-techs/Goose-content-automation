-- App settings (single row)
create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  parent_drive_folder_id text not null default '',
  slack_webhook_url text,
  slack_channel text,
  default_prompt text not null default 'Professional lifestyle photo, high quality, natural lighting',
  generation_count int not null default 4,
  cron_enabled boolean not null default false,
  cron_day text not null default 'monday',
  updated_at timestamptz not null default now()
);

-- Seed a single settings row
insert into app_settings (parent_drive_folder_id) values ('') on conflict do nothing;

-- Personas
create table if not exists personas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  drive_folder_id text not null unique,
  drive_folder_url text not null default '',
  higgsfield_soul_id text,
  status text not null default 'pending' check (status in ('pending','onboarding','active','error')),
  image_count int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_personas_status on personas(status);

-- Batches
create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references personas(id) on delete cascade,
  drive_subfolder_id text not null default '',
  drive_subfolder_url text not null default '',
  image_count int not null default 0,
  status text not null default 'generating' check (status in ('generating','uploading','completed','failed')),
  error_message text,
  slack_notified boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_batches_persona on batches(persona_id);
create index idx_batches_status on batches(status);

-- Generation logs
create table if not exists generation_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  persona_id uuid not null references personas(id) on delete cascade,
  higgsfield_job_id text,
  prompt text not null default '',
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  output_url text,
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_generation_logs_batch on generation_logs(batch_id);
