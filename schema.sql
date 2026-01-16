
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT,
  nickname TEXT,
  avatar TEXT,
  external_token TEXT,
  created_at INTEGER
);

DROP TABLE IF EXISTS questions;
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  category TEXT,
  accuracy INTEGER,
  created_at INTEGER,
  json_data TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id);

DROP TABLE IF EXISTS question_images;
CREATE TABLE question_images (
  question_id TEXT,
  field_key TEXT,
  image_data TEXT,
  created_at INTEGER,
  PRIMARY KEY (question_id, field_key)
);

DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  score INTEGER,
  created_at INTEGER,
  json_data TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
