ALTER TABLE states
ADD COLUMN started_todo_id TEXT REFERENCES todos(id) DEFERRABLE INITIALLY DEFERRED;

CREATE TRIGGER IF NOT EXISTS state_started_must_be_priority
BEFORE UPDATE OF started_todo_id ON states
WHEN NEW.started_todo_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM todos
    WHERE id = NEW.started_todo_id
      AND state_id = NEW.id
      AND status = 'active'
      AND id = NEW.priority_todo_id
  ) THEN RAISE(ABORT, 'invalid_started_todo') END;
END;
