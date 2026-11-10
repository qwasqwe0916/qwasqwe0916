-- =============================================================
-- Campus Teammate Matcher - 개발·테스트용 샘플 데이터 (sample.sql)
-- 실행: mysql -u root -p < db/sample.sql   (schema.sql, seed.sql 실행 후)
--
-- * auth_uid는 가짜 값이므로 이 계정들로는 실제 로그인할 수 없다.
--   (화면·SQL 확인용 데이터)
-- * schema.sql로 테이블을 새로 만든 직후에 실행해야 한다. (ID가 1부터 시작한다고 가정)
-- =============================================================

-- 한글이 깨지지 않도록 접속 문자셋을 utf8mb4로 지정
SET NAMES utf8mb4;

USE campus_matcher;

-- 회원 3명: 작성자 1명, 지원자 2명
INSERT INTO users (auth_uid, email, name, department, github_url) VALUES
  ('00000000-0000-0000-0000-000000000001', 'writer@seoultech.ac.kr',     '김작성', '컴퓨터공학과', 'https://github.com/writer-sample'),
  ('00000000-0000-0000-0000-000000000002', 'applicant1@seoultech.ac.kr', '이지원', '컴퓨터공학과', 'https://github.com/applicant1-sample'),
  ('00000000-0000-0000-0000-000000000003', 'applicant2@seoultech.ac.kr', '박지원', '산업디자인학과', NULL);

-- 보유 기술 스택
INSERT INTO user_skills (user_id, skill_id)
SELECT u.user_id, s.skill_id
FROM users u JOIN skills s
WHERE (u.email = 'writer@seoultech.ac.kr'     AND s.name IN ('Java', 'Spring', 'MySQL'))
   OR (u.email = 'applicant1@seoultech.ac.kr' AND s.name IN ('JavaScript', 'React', 'Node.js', 'Git'))
   OR (u.email = 'applicant2@seoultech.ac.kr' AND s.name IN ('Figma', 'HTML/CSS'));

-- 게시글 3개
INSERT INTO posts (user_id, category_id, title, content, recruit_count, deadline, status) VALUES
  (1, (SELECT category_id FROM categories WHERE name = '공모전'),
   '교내 SW 공모전 웹 서비스 팀원 모집', '프론트엔드 1명, 디자이너 1명을 모집합니다.', 2, '2026-11-30', 'OPEN'),
  (1, (SELECT category_id FROM categories WHERE name = '스터디'),
   'DB 기말고사 대비 SQL 스터디', '매주 화요일 저녁에 SQL 문제를 함께 풉니다.', 4, NULL, 'OPEN'),
  (1, (SELECT category_id FROM categories WHERE name = '팀 프로젝트'),
   '캡스톤 디자인 백엔드 팀원 모집 (마감)', '모집이 완료되었습니다.', 1, '2026-11-01', 'CLOSED');

-- 게시글 요구 기술 (is_required: TRUE 필수, FALSE 선택)
INSERT INTO post_skills (post_id, skill_id, is_required)
SELECT 1, skill_id, name IN ('React', 'JavaScript') FROM skills WHERE name IN ('React', 'JavaScript', 'Figma')
UNION ALL
SELECT 2, skill_id, TRUE FROM skills WHERE name = 'MySQL'
UNION ALL
SELECT 3, skill_id, TRUE FROM skills WHERE name IN ('Spring', 'MySQL');

-- 댓글
INSERT INTO comments (post_id, user_id, content) VALUES
  (1, 2, '프론트엔드로 지원하고 싶습니다. 회의는 대면인가요?'),
  (1, 1, '주 1회 대면, 나머지는 온라인으로 진행합니다.'),
  (2, 3, '비전공자도 참여 가능할까요?');

-- 지원 내역
INSERT INTO applications (post_id, user_id, status, message) VALUES
  (1, 2, 'PENDING',  'React로 프로젝트 경험이 있습니다.'),
  (1, 3, 'ACCEPTED', '디자인 담당으로 지원합니다.'),
  (2, 2, 'REJECTED', NULL);
