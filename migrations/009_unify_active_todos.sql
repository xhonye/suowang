-- Preserve historical facts and counts; unify only actionable items.
UPDATE todos SET kind = 'ongoing' WHERE status = 'active' AND kind = 'single';
