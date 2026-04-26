CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS diary_days (
    id TEXT PRIMARY KEY,
    record_date TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diary_entries (
    id TEXT PRIMARY KEY,
    day_id TEXT NOT NULL,
    entry_time TEXT,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    mood TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (day_id) REFERENCES diary_days(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entry_images (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    file_size INTEGER,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (entry_id) REFERENCES diary_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_summaries (
    id TEXT PRIMARY KEY,
    period_type TEXT NOT NULL,
    period_key TEXT NOT NULL,
    source_day_id TEXT,
    content_json TEXT NOT NULL DEFAULT '{}',
    raw_text TEXT NOT NULL DEFAULT '',
    model_name TEXT NOT NULL DEFAULT '',
    prompt_version TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (source_day_id) REFERENCES diary_days(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_diary_days_record_date ON diary_days(record_date DESC);
CREATE INDEX IF NOT EXISTS idx_diary_entries_day_id ON diary_entries(day_id);
CREATE INDEX IF NOT EXISTS idx_diary_entries_sort_order ON diary_entries(day_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_entry_images_entry_id ON entry_images(entry_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_period ON ai_summaries(period_type, period_key);

