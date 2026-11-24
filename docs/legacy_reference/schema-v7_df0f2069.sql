USE nexus_ai;

-- v14: temporary chats, stopped/partial replies, cited sources and editable memories.
-- MySQL 8 has no ADD COLUMN IF NOT EXISTS, so scripts/migrate-v7.js treats
-- "duplicate column" and "duplicate key" errors as already applied.
ALTER TABLE conversations ADD COLUMN is_temporary TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD INDEX idx_conversations_temporary (is_temporary, updated_at);
ALTER TABLE messages ADD COLUMN stopped TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN sources_json MEDIUMTEXT NULL;
ALTER TABLE memory_items ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
