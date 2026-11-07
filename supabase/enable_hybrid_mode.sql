-- Enable Hybrid as an enrolment option for both board bootcamp programs.
-- Hybrid is approved for launch. Batch-specific classroom dates, times and venue
-- remain to be confirmed before payment; this script does not promise a fixed split,
-- recordings, a venue or unrestricted classroom access.
begin;

insert into public.program_learning_modes (program_id, mode, label, is_available, batch_label)
select p.id, 'hybrid', 'Hybrid — Flexible Online + Classroom Learning', true,
       case p.code
         when 'class-10' then 'Nov 30 - Class 10 Hybrid'
         when 'class-12' then 'Nov 30 - Class 12 Hybrid'
       end
from public.programs p
where p.code in ('class-10', 'class-12')
on conflict (program_id, mode) do update
set label = excluded.label,
    is_available = true,
    batch_label = excluded.batch_label,
    updated_at = now();

commit;
