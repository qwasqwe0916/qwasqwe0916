# 🧩 정규화 검토 (Normalization)

* 작성일: 2026-11-09
* 대상: [`erd.md`](erd.md)의 테이블 9개
* 정규화 목표: **제3정규형(3NF)** 이상

---

## 1. 출발점: 정규화 전 테이블

정규화를 하지 않고 "모집 게시글" 하나에 필요한 정보를 모두 담으면 다음과 같은 형태가 된다.

| post_id | title | writer_email | writer_name | category | skills | applicants |
|---|---|---|---|---|---|---|
| 1 | SW 공모전 팀원 모집 | writer@… | 김작성 | 공모전 | React(필수), JavaScript(필수), Figma(선택) | 이지원(대기), 박지원(수락) |
| 2 | SQL 스터디 | writer@… | 김작성 | 스터디 | MySQL(필수) | 이지원(거절) |

이 구조의 문제점은 다음과 같다.

| 문제 | 예시 |
|---|---|
| **삽입 이상** | 아직 글을 쓰지 않은 회원, 아무도 요구하지 않은 기술 스택은 저장할 곳이 없다 |
| **갱신 이상** | 김작성이 이름을 바꾸면 김작성이 쓴 모든 글의 행을 고쳐야 하며, 하나라도 빠뜨리면 데이터가 불일치한다 |
| **삭제 이상** | 2번 글을 삭제하면 "이지원이 거절되었다"는 사실 외에 MySQL 기술 정보도 함께 사라질 수 있다 |
| **검색 어려움** | `skills`, `applicants` 칸에 값이 여러 개 들어 있어 "React가 필요한 글"을 정확히 찾기 어렵다 |

---

## 2. 제1정규형 (1NF): 모든 칸은 하나의 값만 가진다

**규칙:** 각 칸(속성)은 더 이상 나눌 수 없는 하나의 값(원자값)만 가져야 하며, 반복되는 값의 묶음이 없어야 한다.

**위반 사항:** `skills`와 `applicants` 칸에 여러 값이 들어 있다.

**조치:** 여러 값을 가지는 속성을 별도 테이블로 분리하여 **값 하나당 행 하나**로 저장한다.

| 분리 전 | 분리 후 |
|---|---|
| `skills` = "React(필수), JavaScript(필수), Figma(선택)" | `post_skills` 테이블: (1, React, 필수), (1, JavaScript, 필수), (1, Figma, 선택) |
| `applicants` = "이지원(대기), 박지원(수락)" | `applications` 테이블: (1, 이지원, 대기), (1, 박지원, 수락) |
| 사용자의 보유 기술 (같은 문제) | `user_skills` 테이블: (김작성, Java), (김작성, Spring), … |

**결과:** 모든 테이블의 모든 칸이 하나의 값만 가진다.

---

## 3. 제2정규형 (2NF): 부분 종속 제거

**규칙:** 1NF를 만족하고, 기본 키가 여러 컬럼으로 이루어진 경우(복합 키) **키가 아닌 컬럼은 키 전체에 종속**되어야 한다. 키의 일부에만 종속되는 컬럼(부분 종속)이 있으면 안 된다.

**검토 대상:** 복합 키를 가진 `user_skills`, `post_skills`, 그리고 후보 키 (post_id, user_id)를 가진 `applications`

| 테이블 | 키 | 키가 아닌 컬럼 | 종속 관계 | 판정 |
|---|---|---|---|---|
| `user_skills` | (user_id, skill_id) | 없음 | — | ✅ |
| `post_skills` | (post_id, skill_id) | `is_required` | "**이 글**에서 **이 기술**이 필수인가"는 글과 기술의 **조합 전체**에 따라 정해진다 | ✅ |
| `applications` | (post_id, user_id) | `status`, `message`, `applied_at` | "**이 사람**이 **이 글**에 지원한 상태"이므로 조합 전체에 종속된다 | ✅ |

**위반될 뻔한 예:** `post_skills`에 기술 이름(`skill_name`)을 함께 저장하면, 기술 이름은 `skill_id`만으로 정해지므로(키의 일부에만 종속) 2NF 위반이다. → 기술 이름은 `skills`에만 저장하고 `skill_id`로 참조한다.

**결과:** 모든 테이블에 부분 종속이 없다. 단일 컬럼 기본 키를 가진 나머지 테이블은 부분 종속이 생길 수 없으므로 자동으로 2NF를 만족한다.

---

## 4. 제3정규형 (3NF): 이행 종속 제거

**규칙:** 2NF를 만족하고, 키가 아닌 컬럼이 **다른 키가 아닌 컬럼을 거쳐** 키에 종속(이행 종속)되면 안 된다.

**위반될 뻔한 예와 조치:**

| 테이블 | 위반 예 | 이행 종속 | 조치 |
|---|---|---|---|
| `posts` | 작성자 이름(`writer_name`)을 함께 저장 | `post_id` → `user_id` → `writer_name` | 작성자는 `user_id`로만 참조하고, 이름은 `users`에서 조회 |
| `posts` | 카테고리 이름(`category_name`)을 함께 저장 | `post_id` → `category_id` → `category_name` | 카테고리를 `categories` 테이블로 분리 |
| `comments` | 댓글 작성자 이름 저장 | `comment_id` → `user_id` → `name` | `user_id`로만 참조 |
| `applications` | 지원자의 기술 스택 저장 | `application_id` → `user_id` → 기술 스택 | 지원자 ID로 `user_skills`에서 조회 |

**결과:** 모든 테이블에서 키가 아닌 컬럼은 오직 기본 키에만 직접 종속된다.

---

## 5. 테이블별 최종 판정

| 테이블 | 기본 키 | 1NF | 2NF | 3NF | 비고 |
|---|---|---|---|---|---|
| `users` | user_id | ✅ | ✅ | ✅ | `auth_uid`, `email`도 후보 키 (UNIQUE) |
| `categories` | category_id | ✅ | ✅ | ✅ | `name`도 후보 키 |
| `skills` | skill_id | ✅ | ✅ | ✅ | `name`도 후보 키 |
| `user_skills` | (user_id, skill_id) | ✅ | ✅ | ✅ | 키 외 컬럼 없음 |
| `posts` | post_id | ✅ | ✅ | ✅ | 작성자·카테고리는 FK로만 참조 |
| `post_skills` | (post_id, skill_id) | ✅ | ✅ | ✅ | `is_required`는 조합에 종속 |
| `comments` | comment_id | ✅ | ✅ | ✅ | |
| `applications` | application_id | ✅ | ✅ | ✅ | (post_id, user_id)도 후보 키 (UNIQUE) |
| `team_messages` | message_id | ✅ | ✅ | ✅ | 작성자 이름은 저장하지 않고 `user_id`로 참조 |

* 모든 테이블에서 결정자(다른 컬럼을 결정하는 컬럼)가 모두 후보 키이므로 **BCNF**도 만족한다.

---

## 6. 저장하지 않고 계산하는 값

다음 값들은 컬럼으로 저장하면 원본 데이터와 불일치할 위험이 있으므로 **조회 시 계산**한다.

| 값 | 계산 방법 |
|---|---|
| 게시글의 지원자 수 | `applications`에서 해당 `post_id`의 행 수 (COUNT) |
| 게시글의 수락 인원 | `applications`에서 `status = 'ACCEPTED'`인 행 수 |
| 게시글의 댓글 수 | `comments`에서 해당 `post_id`의 행 수 |
| 사용자의 기술 스택 목록 | `user_skills`와 `skills`를 연결하여 조회 |
| 팀원 목록 | 게시글 작성자 + `applications`에서 그 글의 `status = 'ACCEPTED'`인 지원자 (팀원 테이블을 따로 두지 않음) |
