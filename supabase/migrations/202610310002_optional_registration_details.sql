-- The streamlined checkout confirms guardian contact, subject pathway and mode with the team after enrolment.
alter table public.students alter column guardian_name drop not null;
alter table public.students alter column guardian_mobile_e164 drop not null;
alter table public.enrolments alter column preferred_language drop not null;
alter table public.enrolments alter column learning_mode drop not null;

update public.students set guardian_name = null where guardian_name = '';
update public.students set guardian_mobile_e164 = null where guardian_mobile_e164 = '';
update public.students set guardian_email = null where guardian_email = '';
update public.enrolments set preferred_language = null where preferred_language = '';
