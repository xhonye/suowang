ALTER TABLE todos
ADD COLUMN kind TEXT NOT NULL DEFAULT 'single'
CHECK (kind IN ('single', 'ongoing'));

CREATE TABLE todo_occurrences (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL,
  completed_on TEXT NOT NULL CHECK (
    completed_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  completed_at TEXT NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  UNIQUE (todo_id, completed_on)
);

CREATE INDEX todo_occurrence_completed
ON todo_occurrences(todo_id, completed_on DESC);
