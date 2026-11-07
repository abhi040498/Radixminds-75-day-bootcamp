-- Idempotently configure the three owner-approved learning modes for both programs.
-- Hybrid classroom dates, times and venue still require batch-level confirmation;
-- the frontend states this explicitly and does not promise a fixed split or recordings.
-- Review target program IDs/codes before applying in Supabase.
begin;

insert into public.program_learning_modes (program_id, mode, label, is_available, batch_label)
select p.id, modes.mode, modes.label, true, modes.batch_label
from public.programs p
join (values
  ('class-10', 'online',  'Online — Live Interactive Classes', 'Nov 30 - Class 10 Online'),
  ('class-10', 'hybrid',  'Hybrid — Flexible Online + Classroom Learning', 'Nov 30 - Class 10 Hybrid'),
  ('class-10', 'offline', 'Offline — Classroom Training', 'Nov 30 - Class 10 Offline'),
  ('class-12', 'online',  'Online — Live Interactive Classes', 'Nov 30 - Class 12 Online'),
  ('class-12', 'hybrid',  'Hybrid — Flexible Online + Classroom Learning', 'Nov 30 - Class 12 Hybrid'),
  ('class-12', 'offline', 'Offline — Classroom Training', 'Nov 30 - Class 12 Offline')
) as modes(program_code, mode, label, batch_label) on modes.program_code = p.code
on conflict (program_id, mode) do update
set label = excluded.label,
    is_available = excluded.is_available,
    batch_label = excluded.batch_label,
    updated_at = now();

commit;
