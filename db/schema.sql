-- =============================================================
-- Campus Teammate Matcher - 테이블 생성 (schema.sql)
-- 설계 문서: docs/erd.md, docs/normalization.md
-- 실행: mysql -u root -p < db/schema.sql
--
-- ⚠️ 주의: 다시 실행하면 기존 테이블과 데이터가 모두 삭제되고 새로 만들어진다.
-- =============================================================

-- 한글이 깨지지 않도록 접속 문자셋을 utf8mb4로 지정
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS campus_matcher
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE campus_matcher;

-- 참조하는 테이블부터 역순으로 삭제
DROP TABLE IF EXISTS team_messages;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS post_skills;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS user_skills;
DROP TABLE IF EXISTS skills;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

-- -------------------------------------------------------------
-- (1) users: 회원
-- -------------------------------------------------------------
CREATE TABLE users (
  user_id     INT          NOT NULL AUTO_INCREMENT,
  auth_uid    CHAR(36)     NOT NULL COMMENT 'Supabase 사용자 ID (UUID)',
  email       VARCHAR(255) NOT NULL COMMENT '교내 이메일',
  name        VARCHAR(50)  NOT NULL COMMENT '실명 (중복 허용)',
  department  VARCHAR(50)  NULL     COMMENT '학과',
  github_url  VARCHAR(255) NULL     COMMENT 'GitHub 프로필 주소',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '가입일',
  PRIMARY KEY (user_id),
  CONSTRAINT uq_users_auth_uid UNIQUE (auth_uid),
  CONSTRAINT uq_users_email    UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- (2) categories: 게시글 카테고리
-- -------------------------------------------------------------
CREATE TABLE categories (
  category_id INT         NOT NULL AUTO_INCREMENT,
  name        VARCHAR(30) NOT NULL,
  PRIMARY KEY (category_id),
  CONSTRAINT uq_categories_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- (3) skills: 기술 스택 목록
-- -------------------------------------------------------------
CREATE TABLE skills (
  skill_id INT         NOT NULL AUTO_INCREMENT,
  name     VARCHAR(50) NOT NULL,
  PRIMARY KEY (skill_id),
  CONSTRAINT uq_skills_name UNIQUE (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- (4) user_skills: 사용자 보유 기술 (M:N)
-- -------------------------------------------------------------
CREATE TABLE user_skills (
  user_id  INT NOT NULL,
  skill_id INT NOT NULL,
  PRIMARY KEY (user_id, skill_id),
  CONSTRAINT fk_user_skills_user  FOREIGN KEY (user_id)  REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_skills_skill FOREIGN KEY (skill_id) REFERENCES skills (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- (5) posts: 모집 게시글
-- -------------------------------------------------------------
CREATE TABLE posts (
  post_id       INT          NOT NULL AUTO_INCREMENT,
  user_id       INT          NOT NULL COMMENT '작성자',
  category_id   INT          NOT NULL,
  title         VARCHAR(100) NOT NULL,
  content       TEXT         NOT NULL,
  recruit_count INT          NOT NULL COMMENT '모집 인원',
  deadline      DATE         NULL     COMMENT '모집 마감일',
  status        ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN' COMMENT '모집중 / 모집완료',
  is_anonymous  BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'TRUE: 작성자 이름을 익명으로 표시',
  contact_link  VARCHAR(255) NULL     COMMENT '팀 연락 링크 (카카오톡 오픈채팅, 디스코드만 허용, 팀원에게만 공개)',
  team_formed_at DATETIME    NULL     COMMENT '팀 구성 시각 (NULL이면 아직 팀 미구성)',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id),
  CONSTRAINT fk_posts_user     FOREIGN KEY (user_id)     REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_category FOREIGN KEY (category_id) REFERENCES categories (category_id),
  CONSTRAINT chk_posts_recruit_count CHECK (recruit_count >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- (6) post_skills: 게시글 요구 기술 (M:N)
-- -------------------------------------------------------------
CREATE TABLE post_skills (
  post_id     INT     NOT NULL,
  skill_id    INT     NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'TRUE: 필수, FALSE: 선택',
  PRIMARY KEY (post_id, skill_id),
  CONSTRAINT fk_post_skills_post  FOREIGN KEY (post_id)  REFERENCES posts (post_id) ON DELETE CASCADE,
  CONSTRAINT fk_post_skills_skill FOREIGN KEY (skill_id) REFERENCES skills (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- (7) comments: 댓글
-- -------------------------------------------------------------
CREATE TABLE comments (
  comment_id INT      NOT NULL AUTO_INCREMENT,
  post_id    INT      NOT NULL,
  user_id    INT      NOT NULL COMMENT '작성자',
  content    TEXT     NOT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'TRUE: 작성자 이름을 익명으로 표시',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id),
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- (8) applications: 지원 내역 (M:N)
-- -------------------------------------------------------------
CREATE TABLE applications (
  application_id INT          NOT NULL AUTO_INCREMENT,
  post_id        INT          NOT NULL,
  user_id        INT          NOT NULL COMMENT '지원자',
  status         ENUM('PENDING', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING' COMMENT '대기 / 수락 / 거절',
  message        VARCHAR(300) NULL     COMMENT '지원 메시지',
  applied_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (application_id),
  CONSTRAINT uq_applications_post_user UNIQUE (post_id, user_id),
  CONSTRAINT fk_applications_post FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE,
  CONSTRAINT fk_applications_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- (9) team_messages: 팀 게시판 (팀 구성 후 작성자와 수락된 팀원만 이용)
-- 팀원은 따로 저장하지 않고 "글 작성자 + 그 글에 수락된 지원자"로 판단한다
-- -------------------------------------------------------------
CREATE TABLE team_messages (
  message_id INT      NOT NULL AUTO_INCREMENT,
  post_id    INT      NOT NULL,
  user_id    INT      NOT NULL COMMENT '작성자',
  content    TEXT     NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id),
  CONSTRAINT fk_team_messages_post FOREIGN KEY (post_id) REFERENCES posts (post_id) ON DELETE CASCADE,
  CONSTRAINT fk_team_messages_user FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
