-- =============================================================
-- Campus Teammate Matcher - 기본 데이터 (seed.sql)
-- 서비스 운영에 필요한 고정 목록 (카테고리, 기술 스택)
-- 실행: mysql -u root -p < db/seed.sql   (schema.sql 실행 후)
-- =============================================================

USE campus_matcher;

-- 게시글 카테고리
INSERT INTO categories (name) VALUES
  ('공모전'),
  ('스터디'),
  ('팀 프로젝트');

-- 기술 스택 (임시 목록, 추후 확정)
INSERT INTO skills (name) VALUES
  ('C'), ('C++'), ('Java'), ('Python'), ('JavaScript'), ('TypeScript'),
  ('Kotlin'), ('Swift'),
  ('HTML/CSS'), ('React'), ('Vue'), ('Next.js'),
  ('Node.js'), ('Spring'), ('Django'),
  ('MySQL'), ('Git'), ('AWS'),
  ('Figma'), ('Android'), ('iOS');
