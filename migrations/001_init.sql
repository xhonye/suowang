CREATE TABLE IF NOT EXISTS states (
  id TEXT PRIMARY KEY CHECK (id IN ('restore', 'work', 'life')),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL UNIQUE CHECK (sort_order BETWEEN 1 AND 3),
  cue TEXT NOT NULL DEFAULT '',
  current_mainline_id TEXT,
  priority_todo_id TEXT,
  FOREIGN KEY (current_mainline_id) REFERENCES mainlines(id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (priority_todo_id) REFERENCES todos(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS mainlines (
  id TEXT PRIMARY KEY,
  state_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 1 AND 3),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  goal TEXT NOT NULL DEFAULT '',
  success_criteria TEXT NOT NULL DEFAULT '',
  horizon TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  created_at TEXT NOT NULL,
  ended_at TEXT,
  FOREIGN KEY (state_id) REFERENCES states(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status IN ('completed', 'abandoned') AND ended_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS active_mainline_slot
ON mainlines(state_id, slot_index)
WHERE status = 'active';

CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  state_id TEXT NOT NULL,
  mainline_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
  position INTEGER NOT NULL CHECK (position >= 1),
  created_at TEXT NOT NULL,
  ended_at TEXT,
  FOREIGN KEY (state_id) REFERENCES states(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (mainline_id) REFERENCES mainlines(id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (status = 'active' AND ended_at IS NULL)
    OR (status IN ('completed', 'abandoned') AND ended_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS todo_scope_position
ON todos(state_id, mainline_id, status, position);

CREATE INDEX IF NOT EXISTS history_mainline_ended
ON mainlines(status, ended_at DESC);

CREATE INDEX IF NOT EXISTS history_todo_ended
ON todos(status, ended_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  display_name TEXT NOT NULL,
  avatar_path TEXT,
  initialized_on TEXT NOT NULL,
  last_viewed_state_id TEXT NOT NULL,
  FOREIGN KEY (last_viewed_state_id) REFERENCES states(id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS states_protect_identity
BEFORE UPDATE OF id, name, sort_order ON states
BEGIN
  SELECT RAISE(ABORT, 'state_identity_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS states_protect_delete
BEFORE DELETE ON states
BEGIN
  SELECT RAISE(ABORT, 'system_states_cannot_be_deleted');
END;

CREATE TRIGGER IF NOT EXISTS mainline_protect_state
BEFORE UPDATE OF state_id ON mainlines
BEGIN
  SELECT RAISE(ABORT, 'mainline_state_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS todo_protect_state
BEFORE UPDATE OF state_id ON todos
BEGIN
  SELECT RAISE(ABORT, 'todo_state_is_immutable');
END;

CREATE TRIGGER IF NOT EXISTS todo_mainline_matches_state_insert
BEFORE INSERT ON todos
WHEN NEW.mainline_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM mainlines
    WHERE id = NEW.mainline_id AND state_id = NEW.state_id
  ) THEN RAISE(ABORT, 'todo_mainline_state_mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS todo_mainline_matches_state_update
BEFORE UPDATE OF mainline_id ON todos
WHEN NEW.mainline_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM mainlines
    WHERE id = NEW.mainline_id AND state_id = NEW.state_id
  ) THEN RAISE(ABORT, 'todo_mainline_state_mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS state_current_must_be_active
BEFORE UPDATE OF current_mainline_id ON states
WHEN NEW.current_mainline_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM mainlines
    WHERE id = NEW.current_mainline_id
      AND state_id = NEW.id
      AND status = 'active'
  ) THEN RAISE(ABORT, 'invalid_current_mainline') END;
END;

CREATE TRIGGER IF NOT EXISTS state_priority_must_be_eligible
BEFORE UPDATE OF priority_todo_id ON states
WHEN NEW.priority_todo_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM todos
    WHERE id = NEW.priority_todo_id
      AND state_id = NEW.id
      AND status = 'active'
      AND (mainline_id IS NULL OR mainline_id = NEW.current_mainline_id)
  ) THEN RAISE(ABORT, 'invalid_priority_todo') END;
END;

INSERT OR IGNORE INTO states(id, name, sort_order, cue) VALUES
  ('restore', '恢复', 1, '让身体和注意力重新可用'),
  ('work', '工作', 2, '推进真正重要的事'),
  ('life', '生活', 3, '去体验，也去连接');

INSERT OR IGNORE INTO app_settings(
  singleton,
  display_name,
  avatar_path,
  initialized_on,
  last_viewed_state_id
) VALUES (1, 'Honye', NULL, date('now', 'localtime'), 'work');
