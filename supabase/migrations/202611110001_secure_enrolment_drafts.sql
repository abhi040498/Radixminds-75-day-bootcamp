-- Private, short-lived enrolment drafts. The browser receives only a random
-- HttpOnly session cookie; this table is accessed through the server's
-- service-role client and has no client-facing RLS policies.
create table if not exists public.enrolment_drafts (
  id uuid primary key default gen_random_uuid(),
  session_token_hash char(64) not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  program_code text check (program_code is null or program_code in ('class-10','class-12')),
  subject_choice text check (subject_choice is null or subject_choice in ('Mathematics','Biology')),
  learning_mode text check (learning_mode is null or learning_mode in ('online','hybrid','offline')),
  current_step smallint not null default 0 check (current_step between 0 and 2),
  full_name text,
  mobile text,
  email text,
  -- Keep drafts permissive while a date input is being edited. The final
  -- enrolment RPC remains responsible for validating/casting this value.
  date_of_birth text,
  school_name text,
  board text,
  preferred_language text,
  whatsapp_mobile text,
  registration_idempotency_key uuid not null unique,
  payment_idempotency_key uuid not null unique,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists enrolment_drafts_expiry_idx
  on public.enrolment_drafts (expires_at);

alter table public.enrolment_drafts enable row level security;
revoke all on table public.enrolment_drafts from public, anon, authenticated;
grant select, insert, update, delete on table public.enrolment_drafts to service_role;
