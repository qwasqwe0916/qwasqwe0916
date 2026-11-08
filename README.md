# 🏫 Campus Teammate Matcher (교내 팀원 매칭 플랫폼)

## 1. 프로젝트 개요 (Project Overview)
본 프로젝트는 대학 구성원(재학생)을 대상으로 팀 프로젝트, 공모전, 스터디를 함께 진행할 팀원을 효율적으로 모집하고 지원할 수 있는 교내 전용 매칭 플랫폼을 구축하는 것을 목표로 한다.  
교내 이메일 인증을 적용하여 신뢰성을 확보하고, 각 사용자의 보유 기술 스택과 GitHub 프로필을 데이터베이스화하여 팀원을 탐색할 수 있도록 지원한다.

---

## 2. 시스템 주요 기능 (Key Features)

### (1) 회원 관리 및 교내 구성원 인증
* 교내 전용 이메일(`@*.ac.kr` 등)로 발송된 인증번호를 통한 재학생 신분 검증 (**Supabase Auth** 이용)
* 사용자 기본 정보, GitHub 프로필 URL, 보유 기술 스택 관리 (**MySQL** 저장)

### (2) 통합 게시판 시스템
* 공모전, 스터디, 팀 프로젝트 등의 카테고리로 통합 관리
* 게시글 작성 시 프로젝트에 필요한 필수/선택 기술 스택 태그 설정

### (3) 프로필 및 기술 스택 조회
* 작성자 및 댓글 참여자의 프로필 클릭 시, 해당 사용자의 기술 스택 및 GitHub 연동 정보 노출

### (4) [확장 기능] 지원 관리 시스템 (Application System)
* 모집 글에 대한 팀원 지원 신청 기능
* 작성자의 마이페이지 내 지원자 수락/거절 상태(`Status`) 관리

---

## 3. 시스템 구성 (Architecture)

### (1) 역할 분담
인증(로그인)은 외부 서비스인 Supabase Auth에 위임하고, 서비스의 모든 핵심 데이터는 MySQL로 설계·관리한다.

| 구분 | Supabase Auth | MySQL |
|---|---|---|
| 담당 | 회원가입, 로그인, 교내 이메일 인증(OTP), 로그인 토큰(JWT) 발급 | 회원 프로필, 기술 스택, 게시글, 댓글, 지원 내역 등 모든 기능 데이터 |
| 보관 데이터 | 이메일, 비밀번호(암호화), 인증 여부 | ERD 및 정규화 대상 전체 테이블 |
| 비고 | Supabase DB(Postgres)에는 기능 데이터를 저장하지 않는다 | 과제 제약에 따라 주요 데이터는 MySQL로 구현한다 |

### (2) 요청 흐름
```
[웹 브라우저]
   │  ① 회원가입/로그인 ─────────▶ [Supabase Auth]
   │  ◀────── 로그인 토큰(JWT) ───┘
   │
   │  ② 기능 요청 + Authorization: Bearer <JWT>
   ▼
[백엔드 서버]
   │  ③ JWT 검증 (Supabase)
   │  ④ 토큰의 사용자 ID(auth_uid)로 MySQL 조회/저장
   ▼
[MySQL]
```
* 브라우저는 MySQL에 직접 접근하지 않으며, 모든 데이터 요청은 백엔드 서버를 거친다.
* 서버는 요청마다 JWT를 검증한 뒤 처리하며, 클라이언트가 보낸 사용자 ID 값은 신뢰하지 않는다.
* 교내 이메일 도메인(`.ac.kr`) 검사는 화면과 서버 양쪽에서 수행한다.

### (3) 기술 스택
| 구분 | 사용 기술 |
|---|---|
| 인증 | Supabase Auth (이메일 OTP) |
| 데이터베이스 | MySQL |
| 백엔드 | Node.js + Express, `mysql2` (예정) |
| 프론트엔드 | React + Vite, Supabase JS SDK (예정) |

---

## 4. 데이터베이스 설계 (Database Design)

### (1) 테이블 구성 (초안)
| 테이블 | 주요 컬럼 | 비고 |
|---|---|---|
| `users` | user_id(PK), auth_uid(UNIQUE), email(UNIQUE), name, github_url, created_at | `auth_uid`로 Supabase 사용자와 연결 |
| `skills` | skill_id(PK), name(UNIQUE) | 기술 스택 목록 |
| `user_skills` | user_id(FK), skill_id(FK) | 사용자-기술스택 다대다 중간 테이블, PK(user_id, skill_id) |
| `categories` | category_id(PK), name | 공모전 / 스터디 / 팀 프로젝트 |
| `posts` | post_id(PK), user_id(FK), category_id(FK), title, content, recruit_count, deadline, created_at | 모집 게시글 |
| `post_skills` | post_id(FK), skill_id(FK), is_required | 게시글-기술스택 다대다 중간 테이블, 필수/선택 구분 |
| `comments` | comment_id(PK), post_id(FK), user_id(FK), content, created_at | 댓글 |
| `applications` | application_id(PK), post_id(FK), user_id(FK), status, message, applied_at | UNIQUE(post_id, user_id)로 중복 지원 방지 |

### (2) `users` 테이블 예시
```sql
CREATE TABLE users (
  user_id     INT AUTO_INCREMENT PRIMARY KEY,
  auth_uid    CHAR(36)     NOT NULL UNIQUE,  -- Supabase 사용자 ID (UUID)
  email       VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(50)  NOT NULL,
  github_url  VARCHAR(255),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
* 비밀번호와 이메일 인증번호는 Supabase가 관리하므로, MySQL에는 `password_hash` 컬럼과 인증번호 테이블을 두지 않는다.
* 다른 테이블은 `users.user_id`(INT)를 참조하며, Supabase와의 연결은 `auth_uid` 하나로만 이루어진다.
* 사용자의 첫 로그인 시 서버가 `users`에 프로필 행을 생성한다.

### (3) 주요 제약조건
* `applications.status`는 `대기 / 수락 / 거절` 중 하나만 허용한다.
* 게시글 삭제 시 관련 댓글, 지원 내역, 기술 태그의 처리 방식(`ON DELETE CASCADE` 여부)을 확정한다.
* 게시글 수정/삭제, 지원자 수락/거절은 작성자 본인만 가능하도록 서버에서 검증한다.

---

## 5. 단계별 개발 계획 (Development Plan)

개발 환경과 DB를 먼저 구축한 뒤, 프론트엔드와 백엔드를 **기능 단위로 함께** 완성해 나간다.  
기능 하나가 끝날 때마다 실제로 동작하는 상태를 유지하는 것을 원칙으로 한다.

### 1단계: 개발 환경 준비
* MySQL 설치 및 실행, DB 관리 도구(MySQL Workbench 등) 준비
* Supabase 프로젝트 생성, 이메일(OTP) 인증 활성화, 자체 SMTP 설정
* 프로젝트 폴더 구성 (`server/` 백엔드, `client/` 프론트엔드, `db/`, `docs/`)
* `.env` 파일 구성 및 `.gitignore`에 `.env`, `node_modules/` 추가
* **완료 기준:** 서버와 화면이 각각 실행되고, 서버에서 MySQL 접속이 확인된다.

### 2단계: DB 설계 및 구축
* 요구사항 정리 (`docs/requirements.md`)
* ERD 설계 및 다이어그램 작성
* 정규화(1NF ~ 3NF) 수행 및 개체 간 관계, 제약조건 확정 (`docs/erd.md`)
* 테이블 생성 SQL 작성 (`db/schema.sql`)
* 기본 데이터 작성 (`db/seed.sql`: 카테고리, 기술 스택 태그, 테스트 데이터)
  * 기술 스택 태그의 구체적인 목록은 추후 확정한다.
* **완료 기준:** `schema.sql`과 `seed.sql`이 오류 없이 실행되고 데이터가 조회된다.

### 3단계: 기능 단위 개발 (프론트엔드 + 백엔드)
| 순서 | 기능 | 백엔드 | 프론트엔드 |
|---|---|---|---|
| ① | 로그인 및 프로필 | JWT 검증 미들웨어, 첫 로그인 시 MySQL 프로필 생성, 교내 도메인 검증 (`/api/me`) | 로그인(이메일 → 인증번호), 프로필 설정 화면 |
| ② | 게시글 CRUD | 게시글 작성·조회·수정·삭제, 카테고리 분류, 작성자 권한 검증 (`/api/posts`) | 글 목록(카테고리 탭), 상세, 작성·수정 화면 |
| ③ | 기술 스택 | 사용자-기술스택, 게시글-기술스택 중간 테이블 연동, 기술 필터 조회 | 기술 스택 선택 UI, 필수/선택 태그, 목록 필터 |
| ④ | 프로필 및 댓글 | 사용자 프로필 조회(기술 스택, GitHub), 댓글 작성·삭제 | 프로필 보기, 댓글 영역 |
| ⑤ | 지원 관리 시스템 | 지원 신청(중복·본인 글 차단), 지원자 목록, 수락/거절 상태 변경 | 지원 버튼, 마이페이지(지원자 관리, 내 지원 현황) |

### 4단계: 통합 테스트 및 발표 준비
* 예외 상황 점검
  * 교내 이메일(`.ac.kr`)이 아닌 경우 가입 차단 (화면·서버 모두)
  * 토큰 없이 보호된 API 호출 시 401 응답
  * 타인의 게시글 수정·삭제 및 타인 글의 지원자 수락/거절 차단
  * 동일 게시글 중복 지원 차단
  * 게시글 삭제 시 댓글·지원·태그 처리 규칙 확인
* 시연용 테스트 계정(작성자 1명, 지원자 2명) 및 데이터 준비
* 발표 자료 작성: 개요 → 시스템 구성 → ERD 및 정규화 → 주요 SQL → 시연 → 작업 기록

### 기능별 작업 순서 (3단계의 각 기능마다 반복)
1. 기능 브랜치 생성: `git checkout -b feature/기능이름`
2. 계획 수립 및 구현: Claude Code의 `/plan`으로 계획, `/build`로 구현
3. 직접 화면에서 동작 확인
4. 코드 점검: `/ponytail-review`로 불필요한 코드 확인
5. 커밋 → push → PR 생성 후 `main`에 병합
6. 날짜별 작업 기록 작성 (`YYYY_MM_DD.md`)

> 코드가 어느 정도 쌓인 시점(③ 이후)부터는 `/graphify .`로 프로젝트 구조 그래프를 생성하여 구조 파악 및 발표 자료에 활용한다.

---

## 6. 유의 사항 (Notes)
* **인증 메일 발송 한도:** Supabase 기본 메일 서버는 발송량이 제한되므로, 테스트 및 시연을 위해 자체 SMTP를 연결한다.
* **학교 메일 수신 확인:** 학교 메일 서버의 스팸 처리 여부를 사전에 확인하고, 시연용 계정은 미리 가입해 둔다.
* **키 관리:** Supabase `service_role` 키와 MySQL 접속 정보는 서버의 `.env`에만 보관하고 `.gitignore`에 추가한다. 프론트엔드에는 `anon` 키만 사용한다.
