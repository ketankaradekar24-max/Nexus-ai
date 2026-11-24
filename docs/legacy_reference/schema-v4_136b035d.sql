USE nexus_ai;

CREATE TABLE IF NOT EXISTS memory_candidates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(36) NULL,
  content VARCHAR(500) NOT NULL,
  reason VARCHAR(240) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  INDEX idx_memory_candidates_status_created (status, created_at DESC),
  CONSTRAINT fk_memory_candidate_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_tasks (
  id CHAR(36) PRIMARY KEY,
  goal TEXT NOT NULL,
  status ENUM('running','completed','needs_review','failed','cancelled') NOT NULL DEFAULT 'running',
  completed TINYINT(1) NOT NULL DEFAULT 0,
  step_count INT UNSIGNED NOT NULL DEFAULT 0,
  result_text MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agent_tasks_created (created_at DESC),
  INDEX idx_agent_tasks_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_task_steps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  step_number INT UNSIGNED NOT NULL,
  action VARCHAR(80) NOT NULL,
  rationale VARCHAR(240) NULL,
  input_json MEDIUMTEXT NULL,
  result_json MEDIUMTEXT NULL,
  error_text TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_step_task FOREIGN KEY (task_id)
    REFERENCES agent_tasks(id) ON DELETE CASCADE,
  INDEX idx_agent_steps_task (task_id, step_number)
) ENGINE=InnoDB;
