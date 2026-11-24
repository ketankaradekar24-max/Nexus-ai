USE nexus_ai;
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id VARCHAR(36) PRIMARY KEY,
  summary MEDIUMTEXT NOT NULL,
  summarized_through_sequence INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_summary_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB;
