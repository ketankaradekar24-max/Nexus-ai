CREATE DATABASE IF NOT EXISTS nexus_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nexus_ai;

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT 'New chat',
  model VARCHAR(120) NOT NULL DEFAULT 'qwen3:1.7b',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_conversations_updated (updated_at DESC)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL,
  role ENUM('system','user','assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  sequence_num INT UNSIGNED NOT NULL,
  tokens_used INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations(id) ON DELETE CASCADE,
  UNIQUE KEY uk_conversation_sequence (conversation_id, sequence_num),
  INDEX idx_messages_conversation_order (conversation_id, sequence_num)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS memory_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(36) NULL,
  content TEXT NOT NULL,
  embedding LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_memory_created (created_at DESC),
  CONSTRAINT fk_memory_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS uploaded_files (
  id CHAR(36) PRIMARY KEY,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  extracted_text MEDIUMTEXT NULL,
  storage_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
