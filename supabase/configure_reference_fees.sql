-- Set the approved reference fees used to validate the configured 80% discounts.
-- The final program fees remain unchanged at 249900 and 349900 paise.
update public.programs
set standard_fee_paise = case code
      when 'class-10' then 1249500
      when 'class-12' then 1749500
    end,
    updated_at = now()
where code in ('class-10', 'class-12');
