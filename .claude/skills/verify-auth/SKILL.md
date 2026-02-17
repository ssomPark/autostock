---
name: verify-auth
description: OAuth 인증, JWT, DB 모델 제약, Route 인증 패턴, CORS 설정, Frontend 토큰 관리를 검증. 인증/워치리스트/분석저장 관련 코드 변경 후 사용.
---

## Purpose

1. **JWT 토큰 계약 검증** — access/refresh 토큰의 claim 구조, 만료 시간, 타입 필드가 올바른지 확인
2. **OAuth Provider 제약 검증** — ALLOWED_PROVIDERS가 {"google"}으로 고정되어 있고, 콜백 URL 패턴이 올바른지 확인
3. **DB 모델 제약 검증** — UserModel, WatchlistItemModel, SavedAnalysisModel의 unique index, FK, cascade 규칙이 유지되는지 확인
4. **Route 인증 패턴 검증** — 보호 라우트에 `get_current_user` 의존성이 있고, 공개 라우트에 불필요한 인증이 없는지 확인
5. **CORS/Middleware 설정 검증** — allow_credentials=True, SessionMiddleware 존재, 올바른 origin 허용 확인
6. **Frontend 토큰 관리 검증** — fetchWithAuth의 401 자동 리프레시, credentials:"include", in-memory 토큰 저장 패턴 확인

## When to Run

- `backend/src/auth/*.py` 수정 후
- `backend/src/api/routes/auth.py`, `watchlist.py`, `saved_analysis.py`, `paper_trading.py` 수정 후
- `backend/src/models/db_models.py`에서 UserModel, WatchlistItemModel, SavedAnalysisModel 수정 후
- `backend/src/api/app.py`에서 미들웨어 또는 라우터 등록 수정 후
- `frontend/src/lib/api.ts` 또는 `auth-context.tsx`에서 인증 관련 로직 수정 후

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/auth/jwt.py` | JWT 토큰 생성/검증 (create_access_token, create_refresh_token, decode_token) |
| `backend/src/auth/dependencies.py` | FastAPI 인증 의존성 (get_current_user, get_current_user_optional) |
| `backend/src/auth/oauth.py` | authlib OAuth 클라이언트 등록 (Google OIDC) |
| `backend/src/api/routes/auth.py` | 인증 엔드포인트 5개 (login, callback, refresh, me, logout) |
| `backend/src/api/routes/watchlist.py` | 워치리스트 CRUD 3개 (인증 필수) |
| `backend/src/api/routes/saved_analysis.py` | 분석 저장 CRUD 4개 (인증 필수) |
| `backend/src/models/db_models.py` | UserModel, WatchlistItemModel, SavedAnalysisModel (unique index, cascade) |
| `backend/src/config/settings.py` | OAuth/JWT 설정 필드 (client_id, secret, jwt_secret_key, 만료 시간) |
| `backend/src/api/app.py` | SessionMiddleware, CORS 설정, 라우터 등록 |
| `frontend/src/lib/api.ts` | fetchWithAuth (Bearer 헤더, 401 자동 리프레시, credentials:include) |
| `frontend/src/lib/auth-context.tsx` | AuthProvider (토큰 저장, 세션 복원, 로그인/로그아웃 흐름) |
| `frontend/src/lib/watchlist.ts` | 하이브리드 워치리스트 (로그인 시 API, 비로그인 시 localStorage) |
| `backend/src/api/routes/paper_trading.py` | 모의 투자 CRUD 10개 (인증 필수) |
| `frontend/src/app/auth/callback/page.tsx` | OAuth 콜백 처리 (토큰 수신 + AuthProvider 연동) |
| `frontend/src/app/auth/login/page.tsx` | 로그인 페이지 (Google 로그인 버튼) |

## Workflow

### Step 1: JWT 토큰 타입 필드 검증

**파일:** `backend/src/auth/jwt.py`

**검사:** access 토큰에 `"type": "access"`, refresh 토큰에 `"type": "refresh"` 페이로드가 포함되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/auth/jwt.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('access token type', '\"type\": \"access\"' in content or \"'type': 'access'\" in content),
    ('refresh token type', '\"type\": \"refresh\"' in content or \"'type': 'refresh'\" in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Missing token type fields: {failed}')
    sys.exit(1)
print('PASS: Both access and refresh token type fields present')
"
```

**위반:** 토큰 타입 필드가 없으면 `get_current_user`에서 refresh 토큰을 access 토큰으로 오인하여 보안 취약점이 발생합니다.

### Step 2: JWT 만료 시간 설정 검증

**파일:** `backend/src/config/settings.py`

**검사:** `jwt_access_token_expire_minutes`와 `jwt_refresh_token_expire_days`가 정의되어 있어야 합니다.

```bash
cd "I:\Project\AutoStock" && grep -n "jwt_access_token_expire_minutes\|jwt_refresh_token_expire_days" backend/src/config/settings.py
```

**PASS:** 두 설정 모두 존재하고 합리적인 기본값이 설정됨.

**위반:** 설정이 누락되면 토큰이 만료되지 않거나 즉시 만료되어 인증이 불가합니다.

### Step 3: OAuth ALLOWED_PROVIDERS 제약 검증

**파일:** `backend/src/api/routes/auth.py`

**검사:** `ALLOWED_PROVIDERS`가 `{"google"}`로 고정되어 있어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import ast, sys
with open('backend/src/api/routes/auth.py', encoding='utf-8') as f:
    tree = ast.parse(f.read())
for node in ast.walk(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == 'ALLOWED_PROVIDERS':
                if isinstance(node.value, ast.Set):
                    vals = {elt.value for elt in node.value.elts if isinstance(elt, ast.Constant)}
                    if vals == {'google'}:
                        print(f'PASS: ALLOWED_PROVIDERS = {vals}')
                        sys.exit(0)
                    else:
                        print(f'FAIL: ALLOWED_PROVIDERS = {vals} (expected google)')
                        sys.exit(1)
print('FAIL: ALLOWED_PROVIDERS not found')
sys.exit(1)
"
```

**위반:** 잘못된 provider가 추가되면 OAuth 설정 없이 인증을 시도하여 런타임 에러가 발생합니다.

### Step 4: DB 모델 Unique Index 검증

**파일:** `backend/src/models/db_models.py`

**검사:** 다음 unique 제약이 모두 존재해야 합니다:
- `UserModel.email` unique
- `UserModel.(provider, provider_id)` composite unique index
- `WatchlistItemModel.(user_id, ticker)` composite unique index

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/models/db_models.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('users.email unique', 'unique=True' in content and 'email' in content),
    ('users provider+provider_id index', 'ix_users_provider_provider_id' in content),
    ('watchlist user_id+ticker index', 'ix_watchlist_items_user_ticker' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Missing DB constraints: {failed}')
    sys.exit(1)
print(f'PASS: All {len(checks)} DB constraints verified')
"
```

**위반:** unique 제약이 없으면 동일 사용자+종목 조합이 중복 저장되어 데이터 무결성이 깨집니다.

### Step 5: DB Cascade 삭제 검증

**파일:** `backend/src/models/db_models.py`

**검사:** UserModel 삭제 시 연관 데이터가 자동 삭제되도록 cascade 설정이 있어야 합니다.

```bash
cd "I:\Project\AutoStock" && grep -n "cascade\|ondelete" backend/src/models/db_models.py
```

**PASS:** `cascade="all, delete-orphan"` (ORM 레벨)과 `ondelete="CASCADE"` (DB 레벨) 모두 존재.

**위반:** cascade가 없으면 사용자 삭제 시 고아 레코드(orphan)가 남아 FK 위반 또는 데이터 누수가 발생합니다.

### Step 6: 보호 라우트 인증 의존성 검증

**파일:** `backend/src/api/routes/watchlist.py`, `backend/src/api/routes/saved_analysis.py`, `backend/src/api/routes/paper_trading.py`

**검사:** 모든 엔드포인트에 `get_current_user` 의존성이 있어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
files = ['backend/src/api/routes/watchlist.py', 'backend/src/api/routes/saved_analysis.py', 'backend/src/api/routes/paper_trading.py']
for f in files:
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    endpoints = re.findall(r'@router\.(get|post|put|delete|patch)\(', content)
    auth_deps = content.count('get_current_user')
    # Subtract import line
    import_count = content.count('from src.auth.dependencies import')
    actual_deps = auth_deps - import_count
    if actual_deps < len(endpoints):
        print(f'FAIL: {f} has {len(endpoints)} endpoints but only {actual_deps} auth dependencies')
        sys.exit(1)
    print(f'PASS: {f} - {len(endpoints)} endpoints, all with auth dependency')
print('PASS: All protected routes have authentication')
"
```

**위반:** 인증 없는 보호 라우트가 있으면 비인증 사용자가 다른 사용자의 데이터에 접근할 수 있습니다.

### Step 7: CORS allow_credentials 검증

**파일:** `backend/src/api/app.py`

**검사:** `allow_credentials=True`가 설정되어야 합니다. 이것이 없으면 httpOnly 쿠키(refresh token)가 전송되지 않습니다.

```bash
cd "I:\Project\AutoStock" && grep -n "allow_credentials" backend/src/api/app.py
```

**PASS:** `allow_credentials=True` 존재.

**위반:** `allow_credentials=False`이면 프론트엔드에서 refresh token 쿠키가 전송되지 않아 세션 복원이 불가능합니다.

### Step 8: SessionMiddleware 존재 검증

**파일:** `backend/src/api/app.py`

**검사:** `SessionMiddleware`가 등록되어야 합니다. authlib OAuth state 저장에 필요합니다.

```bash
cd "I:\Project\AutoStock" && grep -n "SessionMiddleware" backend/src/api/app.py
```

**PASS:** `app.add_middleware(SessionMiddleware, ...)` 존재.

**위반:** SessionMiddleware가 없으면 OAuth 로그인 시 state 파라미터 검증이 실패하여 CSRF 공격에 취약해집니다.

### Step 9: Auth/Watchlist/SavedAnalysis/PaperTrading 라우터 등록 검증

**파일:** `backend/src/api/app.py`

**검사:** 네 라우터가 모두 올바른 prefix로 등록되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/app.py', encoding='utf-8') as f:
    content = f.read()
required = [
    ('/api/auth', 'auth.router'),
    ('/api/watchlist', 'watchlist.router'),
    ('/api/saved-analyses', 'saved_analysis.router'),
    ('/api/paper', 'paper_trading.router'),
]
missing = []
for prefix, router in required:
    if prefix not in content or router not in content:
        missing.append(f'{prefix} ({router})')
if missing:
    print(f'FAIL: Missing router registrations: {missing}')
    sys.exit(1)
print(f'PASS: All {len(required)} auth-related routers registered')
"
```

**위반:** 라우터가 등록되지 않으면 해당 엔드포인트가 404를 반환합니다.

### Step 10: Frontend fetchWithAuth 401 자동 리프레시 검증

**파일:** `frontend/src/lib/api.ts`

**검사:** `fetchWithAuth`에서 401 응답 시 `refreshAccessToken()`을 호출하고 재요청하는 로직이 있어야 합니다.

```bash
cd "I:\Project\AutoStock" && grep -n "401\|refreshAccessToken\|credentials.*include" frontend/src/lib/api.ts
```

**PASS:** `res.status === 401` 체크 + `refreshAccessToken()` 호출 + `credentials: "include"` 모두 존재.

**위반:** 401 자동 리프레시가 없으면 access token 만료 시 사용자가 매번 재로그인해야 합니다.

### Step 11: Frontend 토큰 저장 방식 검증

**파일:** `frontend/src/lib/api.ts`

**검사:** access token이 모듈 레벨 변수(`_accessToken`)에 저장되고, localStorage나 sessionStorage에 저장되지 않아야 합니다 (XSS 방지).

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('frontend/src/lib/api.ts', encoding='utf-8') as f:
    content = f.read()
# Check in-memory storage exists
if '_accessToken' not in content:
    print('FAIL: _accessToken variable not found')
    sys.exit(1)
# Check no localStorage/sessionStorage for tokens
if 'localStorage.setItem' in content and 'token' in content.lower().split('localStorage')[0][-50:]:
    print('WARN: Token may be stored in localStorage (XSS risk)')
if 'sessionStorage' in content and 'token' in content:
    print('WARN: Token may be stored in sessionStorage (XSS risk)')
print('PASS: Access token stored in-memory (_accessToken)')
"
```

**위반:** 토큰을 localStorage에 저장하면 XSS 공격으로 토큰이 탈취될 수 있습니다.

### Step 12: Watchlist 하이브리드 패턴 검증

**파일:** `frontend/src/lib/watchlist.ts`

**검사:** 로그인 시 API 호출, 비로그인 시 localStorage를 사용하는 하이브리드 패턴이 유지되어야 합니다.

```bash
cd "I:\Project\AutoStock" && grep -n "isLoggedIn\|getAccessToken\|localStorage\|fetchWatchlistAPI\|addToWatchlistAPI\|removeFromWatchlistAPI" frontend/src/lib/watchlist.ts
```

**PASS:** `isLoggedIn()` 체크와 API/localStorage 분기가 모두 존재.

**위반:** 하이브리드 패턴이 깨지면 비로그인 사용자가 워치리스트를 사용할 수 없거나, 로그인 사용자가 서버 동기화 없이 localStorage만 사용하게 됩니다.

### Step 13: FastAPI 라우트 핸들러 튜플 반환 금지 검증

**파일:** `backend/src/api/routes/auth.py`, `backend/src/api/routes/watchlist.py`, `backend/src/api/routes/saved_analysis.py`, `backend/src/api/routes/paper_trading.py`

**검사:** FastAPI 라우트에서 `return {...}, status_code` 형태의 튜플 반환을 사용하면 안 됩니다. FastAPI는 튜플을 HTTP 상태코드로 해석하지 않고 JSON 배열로 직렬화하여 항상 HTTP 200을 반환합니다. 올바른 방법은 `JSONResponse(content={...}, status_code=N)` 또는 `raise HTTPException(status_code=N)`입니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
files = [
    'backend/src/api/routes/auth.py',
    'backend/src/api/routes/watchlist.py',
    'backend/src/api/routes/saved_analysis.py',
    'backend/src/api/routes/paper_trading.py',
]
violations = []
# Pattern: return {something}, <number> — tuple return with status code
pattern = re.compile(r'return\s+\{[^}]*\}\s*,\s*\d{3}')
for f in files:
    with open(f, encoding='utf-8') as fh:
        for i, line in enumerate(fh, 1):
            if pattern.search(line):
                violations.append(f'{f}:{i}: {line.strip()}')
if violations:
    print(f'FAIL: {len(violations)} tuple return pattern(s) found:')
    for v in violations:
        print(f'  - {v}')
    print('FIX: Use JSONResponse(content={...}, status_code=N) or raise HTTPException(status_code=N)')
    sys.exit(1)
print('PASS: No tuple return patterns in auth-related routes')
"
```

**위반:** `return {"error": "msg"}, 401`은 실제로 HTTP 200 + JSON `[{"error":"msg"}, 401]`을 반환합니다. 프론트엔드의 `!res.ok` 체크가 작동하지 않아 인증 오류가 감지되지 않고, 토큰 갱신 로직이 오작동합니다.

## Output Format

```markdown
| # | 검사 항목 | 결과 | 상세 |
|---|----------|------|------|
| 1 | JWT 토큰 타입 필드 | PASS/FAIL | access/refresh type 존재 여부 |
| 2 | JWT 만료 시간 설정 | PASS/FAIL | expire_minutes, expire_days |
| 3 | OAuth ALLOWED_PROVIDERS | PASS/FAIL | {google} |
| 4 | DB Unique Index | PASS/FAIL | email, provider+id, user+ticker |
| 5 | DB Cascade 삭제 | PASS/FAIL | cascade, ondelete |
| 6 | 보호 라우트 인증 | PASS/FAIL | endpoint 수 vs auth 수 |
| 7 | CORS allow_credentials | PASS/FAIL | True 여부 |
| 8 | SessionMiddleware | PASS/FAIL | 존재 여부 |
| 9 | 라우터 등록 | PASS/FAIL | auth, watchlist, saved-analyses |
| 10 | Frontend 401 리프레시 | PASS/FAIL | refreshAccessToken 호출 |
| 11 | Frontend 토큰 저장 | PASS/FAIL | in-memory 방식 |
| 12 | Watchlist 하이브리드 | PASS/FAIL | API/localStorage 분기 |
| 13 | 튜플 반환 패턴 금지 | PASS/FAIL | return dict, status 패턴 |
```

## Exceptions

1. **테스트 코드에서의 JWT 설정 변경** — 테스트에서 만료 시간을 짧게 설정하거나 다른 알고리즘을 사용하는 것은 허용 (프로덕션 설정만 검증 대상)
2. **get_current_user_optional 사용** — 인증이 선택적인 라우트(예: 공개 분석 API에서 로그인 사용자 추가 기능)에서는 `get_current_user_optional`을 사용해도 위반이 아님
3. **localStorage에 watchlist 데이터 저장** — 비로그인 사용자를 위해 watchlist를 localStorage에 저장하는 것은 토큰 저장과 다르며 보안 문제가 아님
