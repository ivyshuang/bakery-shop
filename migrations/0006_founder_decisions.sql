CREATE TABLE IF NOT EXISTS founder_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  decided_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
  problem TEXT NOT NULL,
  experiment TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL DEFAULT '',
  decision TEXT NOT NULL,
  principle TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_founder_decisions_date
ON founder_decisions(decided_on DESC, id DESC);

INSERT INTO founder_decisions (title, decided_on, status, problem, experiment, outcome, decision, principle, scope)
SELECT
  '三轮车台面安装',
  '2026-09-18',
  'ACTIVE',
  '三轮车台面怎样安装？',
  '定制整体不锈钢架，花费200元。',
  '过重、难修改，且可能损伤车身。',
  '改用轻量板材和可拆卸连接件。',
  '移动设备先用可拆方案验证，再制作永久结构。',
  '三轮车及其他移动设备。'
WHERE NOT EXISTS (
  SELECT 1 FROM founder_decisions WHERE title = '三轮车台面安装'
);
