---
name: verify-community
description: 게시판 CRUD, 댓글 권한, 카테고리 필터, 페이지네이션, 프론트엔드 동기화를 검증. 커뮤니티 관련 코드 변경 후 사용.
---

## Purpose

1. **카테고리 동기화 검증** — 백엔드 VALID_CATEGORIES와 프론트엔드 카테고리 목록이 일치하는지 확인
2. **DB 모델 필드 검증** — CommunityPostModel, CommunityCommentModel이 필수 필드를 갖는지 확인
3. **소프트 삭제 일관성** — 삭제된 게시글/댓글이 목록에서 is_deleted=False 조건으로 필터되는지 확인
4. **권한 패턴 검증** — 작성(create)은 get_current_user, 수정/삭제는 소유자+관리자 체크 패턴
5. **댓글 카운트 정합성** — 댓글 생성 시 +1, 삭제 시 -1 로직 존재 확인
6. **API 응답 필드 검증** — _post_to_dict, _comment_to_dict가 프론트엔드에서 사용하는 필드를 모두 포함하는지 확인

## When to Run

- `backend/src/api/routes/community.py` 수정 후
- `backend/src/models/db_models.py`에서 CommunityPostModel/CommunityCommentModel 수정 후
- `frontend/src/app/community/` 하위 페이지 수정 후

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/api/routes/community.py` | 게시판 API 라우트 (CRUD + 댓글) |
| `backend/src/models/db_models.py` | CommunityPostModel, CommunityCommentModel ORM |
| `frontend/src/app/community/page.tsx` | 게시글 목록 페이지 |
| `frontend/src/app/community/[id]/page.tsx` | 게시글 상세 + 댓글 페이지 |
| `frontend/src/app/community/write/page.tsx` | 게시글 작성 페이지 |
| `frontend/src/lib/api.ts` | 커뮤니티 API 클라이언트 함수 |

## Workflow

### Step 1: 카테고리 동기화 검증

**파일:** `backend/src/api/routes/community.py`, `frontend/src/app/community/page.tsx`

**검사:** 백엔드 VALID_CATEGORIES와 프론트엔드 카테고리 목록이 일치해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys

# Backend categories
with open('backend/src/api/routes/community.py', encoding='utf-8') as f:
    be = f.read()
m = re.search(r'VALID_CATEGORIES\s*=\s*\{([^}]+)\}', be)
if not m:
    print('FAIL: VALID_CATEGORIES not found in backend')
    sys.exit(1)
be_cats = set(re.findall(r'\"(\w+)\"', m.group(1)))

# Frontend categories
with open('frontend/src/app/community/page.tsx', encoding='utf-8') as f:
    fe = f.read()
fe_cats = set(re.findall(r'key:\s*\"(\w+)\"', fe))
# Remove 'all' from frontend (it's a filter option, not a real category)
fe_cats.discard('all')

missing_fe = be_cats - fe_cats
missing_be = fe_cats - be_cats
if missing_fe:
    print(f'FAIL: Backend categories missing in frontend: {missing_fe}')
    sys.exit(1)
if missing_be:
    print(f'WARN: Frontend has extra categories not in backend: {missing_be}')
print(f'PASS: Categories synced: {be_cats}')
"
```

### Step 2: DB 모델 필드 검증

**파일:** `backend/src/models/db_models.py`

**검사:** CommunityPostModel과 CommunityCommentModel이 필수 컬럼을 갖는지 확인.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/models/db_models.py', encoding='utf-8') as f:
    content = f.read()

post_fields = ['user_id', 'title', 'content', 'category', 'view_count', 'comment_count', 'is_pinned', 'is_deleted', 'created_at']
comment_fields = ['post_id', 'user_id', 'content', 'is_deleted', 'created_at']

# Check CommunityPostModel
if 'class CommunityPostModel' not in content:
    print('FAIL: CommunityPostModel not found')
    sys.exit(1)
missing_post = [f for f in post_fields if f'{f} =' not in content.split('class CommunityCommentModel')[0].split('class CommunityPostModel')[1]]
if missing_post:
    print(f'FAIL: CommunityPostModel missing fields: {missing_post}')
    sys.exit(1)

# Check CommunityCommentModel
if 'class CommunityCommentModel' not in content:
    print('FAIL: CommunityCommentModel not found')
    sys.exit(1)
missing_comment = [f for f in comment_fields if f'{f} =' not in content.split('class CommunityCommentModel')[1]]
if missing_comment:
    print(f'FAIL: CommunityCommentModel missing fields: {missing_comment}')
    sys.exit(1)

print(f'PASS: Post({len(post_fields)} fields), Comment({len(comment_fields)} fields) all present')
"
```

### Step 3: 소프트 삭제 필터링 검증

**파일:** `backend/src/api/routes/community.py`

**검사:** 목록/상세 조회 쿼리에서 `is_deleted == False` 필터가 적용되는지 확인.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/community.py', encoding='utf-8') as f:
    content = f.read()

checks = {
    'list_posts': 'is_deleted == False' in content.split('def list_posts')[1].split('def ')[0],
    'get_post': 'is_deleted == False' in content.split('def get_post')[1].split('def ')[0],
    'list_comments': 'is_deleted == False' in content.split('def list_comments')[1].split('def ')[0],
}
failed = [k for k, v in checks.items() if not v]
if failed:
    print(f'FAIL: Missing is_deleted filter in: {failed}')
    sys.exit(1)
print(f'PASS: All {len(checks)} list/detail endpoints filter deleted items')
"
```

### Step 4: 권한 패턴 검증

**파일:** `backend/src/api/routes/community.py`

**검사:** 작성 엔드포인트는 `get_current_user`, 수정/삭제는 소유자+관리자 체크 패턴.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/community.py', encoding='utf-8') as f:
    content = f.read()

checks = []
# Create requires auth
if 'def create_post' in content:
    fn = content.split('def create_post')[1].split('def ')[0]
    checks.append(('create_post auth', 'get_current_user' in fn))
if 'def create_comment' in content:
    fn = content.split('def create_comment')[1].split('def ')[0]
    checks.append(('create_comment auth', 'get_current_user' in fn))
# Update/Delete requires owner check
if 'def update_post' in content:
    fn = content.split('def update_post')[1].split('def ')[0]
    checks.append(('update_post owner check', 'post.user_id != user.id' in fn))
    checks.append(('update_post admin check', 'is_admin' in fn))
if 'def delete_post' in content:
    fn = content.split('def delete_post')[1].split('def ')[0]
    checks.append(('delete_post owner check', 'post.user_id != user.id' in fn))
if 'def delete_comment' in content:
    fn = content.split('def delete_comment')[1].split('def ')[0]
    checks.append(('delete_comment owner check', 'comment.user_id != user.id' in fn))

failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Permission checks missing: {failed}')
    sys.exit(1)
print(f'PASS: All {len(checks)} permission checks verified')
"
```

### Step 5: 댓글 카운트 정합성

**파일:** `backend/src/api/routes/community.py`

**검사:** 댓글 생성 시 `comment_count += 1`, 삭제 시 `comment_count -= 1` 로직 확인.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/community.py', encoding='utf-8') as f:
    content = f.read()

create_fn = content.split('def create_comment')[1].split('def ')[0] if 'def create_comment' in content else ''
delete_fn = content.split('def delete_comment')[1] if 'def delete_comment' in content else ''

errors = []
if 'comment_count' not in create_fn or '+' not in create_fn.split('comment_count')[1][:20]:
    errors.append('create_comment does not increment comment_count')
if 'comment_count' not in delete_fn or '-' not in delete_fn.split('comment_count')[1][:20]:
    errors.append('delete_comment does not decrement comment_count')

if errors:
    print(f'FAIL: {errors}')
    sys.exit(1)
print('PASS: comment_count incremented on create, decremented on delete')
"
```

### Step 6: API 응답 필드 검증

**파일:** `backend/src/api/routes/community.py`

**검사:** `_post_to_dict`와 `_comment_to_dict`가 프론트엔드에서 사용하는 모든 필드를 포함하는지 확인.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
with open('backend/src/api/routes/community.py', encoding='utf-8') as f:
    content = f.read()

# Extract _post_to_dict keys
post_fn = content.split('def _post_to_dict')[1].split('def ')[0]
post_keys = set(re.findall(r'\"(\w+)\":', post_fn))
required_post = {'id', 'user_id', 'author_name', 'title', 'content', 'category', 'view_count', 'comment_count', 'created_at'}
missing_post = required_post - post_keys

# Extract _comment_to_dict keys
comment_fn = content.split('def _comment_to_dict')[1].split('def ')[0]
comment_keys = set(re.findall(r'\"(\w+)\":', comment_fn))
required_comment = {'id', 'post_id', 'user_id', 'author_name', 'content', 'is_deleted', 'created_at'}
missing_comment = required_comment - comment_keys

errors = []
if missing_post:
    errors.append(f'_post_to_dict missing: {missing_post}')
if missing_comment:
    errors.append(f'_comment_to_dict missing: {missing_comment}')
if errors:
    print(f'FAIL: {errors}')
    sys.exit(1)
print(f'PASS: post_to_dict({len(post_keys)} fields), comment_to_dict({len(comment_keys)} fields) complete')
"
```

## Output Format

```markdown
| # | 검사 항목 | 결과 | 상세 |
|---|----------|------|------|
| 1 | 카테고리 동기화 | PASS/FAIL | BE/FE 불일치 목록 |
| 2 | DB 모델 필드 | PASS/FAIL | 누락 필드 목록 |
| 3 | 소프트 삭제 필터 | PASS/FAIL | 필터 누락 엔드포인트 |
| 4 | 권한 패턴 | PASS/FAIL | 누락 권한 체크 |
| 5 | 댓글 카운트 정합성 | PASS/FAIL | 증감 로직 누락 |
| 6 | API 응답 필드 | PASS/FAIL | 누락 필드 목록 |
```

## Exceptions

1. **프론트엔드 `all` 카테고리** — 필터 UI용이므로 백엔드 VALID_CATEGORIES에 없어도 정상
2. **is_pinned 필드** — 관리자만 설정 가능하므로 일반 사용자 API에서 수정 불가는 정상
3. **댓글 soft delete 시 content 유지** — is_deleted=True인 댓글의 content가 남아있는 것은 의도적 설계 (관리자가 확인 가능)
