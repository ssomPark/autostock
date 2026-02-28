---
name: verify-rate-limit
description: 비로그인 분석 횟수 제한(Redis rate limit), 429 응답, CORS expose_headers, 프론트엔드 RateLimitError/UI를 검증. Rate limit 관련 코드 변경 후 사용.
---

## Purpose

1. **Redis rate limiter 로직 검증** — Redis SET 기반 unique ticker 카운팅, KST 자정 리셋, fail-open 패턴이 올바른지 확인
2. **분석 엔드포인트 rate limit 적용 검증** — 4개 대상 엔드포인트에 `_check_rate_limit()` 호출이 있고, `/search`에는 없는지 확인
3. **429 응답 구조 검증** — 429 응답에 `reset_seconds`, `limit`, `remaining` 필드가 포함되는지 확인
4. **CORS expose_headers 검증** — `X-RateLimit-Remaining`, `X-RateLimit-Limit`, `X-RateLimit-Reset` 헤더가 브라우저에 노출되는지 확인
5. **프론트엔드 RateLimitError 검증** — `fetchJSON`에서 429 시 `RateLimitError`를 throw하고, 남은 횟수를 전역 변수로 추적하는지 확인
6. **프론트엔드 rate limit UI 검증** — `search/page.tsx`와 `analysis/[ticker]/page.tsx`에서 429 처리 및 로그인 유도 UI가 있는지 확인

## When to Run

- `backend/src/utils/rate_limiter.py` 수정 후
- `backend/src/api/routes/analysis.py`에서 rate limit 관련 코드 수정 후
- `backend/src/api/app.py`에서 CORS `expose_headers` 수정 후
- `backend/src/config/settings.py`에서 `analysis_rate_limit` 수정 후
- `frontend/src/lib/api.ts`에서 `RateLimitError` 또는 rate limit 추적 로직 수정 후
- `frontend/src/app/search/page.tsx` 또는 `frontend/src/app/analysis/[ticker]/page.tsx`에서 rate limit UI 수정 후

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/utils/rate_limiter.py` | Redis SET 기반 unique ticker 카운팅, KST 자정 리셋, fail-open |
| `backend/src/api/routes/analysis.py` | `_check_rate_limit()` 헬퍼, 4개 엔드포인트에 적용, `JSONResponse` + rate limit 헤더 |
| `backend/src/api/app.py` | CORS `expose_headers`에 rate limit 헤더 3개 추가 |
| `backend/src/config/settings.py` | `analysis_rate_limit: int = 5` 설정 |
| `frontend/src/lib/api.ts` | `RateLimitError` 클래스, `_analysisRemaining`/`_analysisResetSeconds` 전역 추적, `fetchJSON`에서 429 처리 |
| `frontend/src/app/search/page.tsx` | 남은 횟수 배지, `ResetCountdown` 컴포넌트, `RateLimitBanner` 로그인 유도 |
| `frontend/src/app/analysis/[ticker]/page.tsx` | `RateLimitBanner` 429 처리 |

## Workflow

### Step 1: Redis rate limiter 핵심 로직 검증

**파일:** `backend/src/utils/rate_limiter.py`

**검사:** Redis SET 기반 unique ticker 카운팅, KST 시간대, fail-open 패턴이 모두 존재해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/utils/rate_limiter.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('Redis SET usage', 'sismember' in content and 'sadd' in content and 'scard' in content),
    ('KST timezone', 'timezone(timedelta(hours=9))' in content),
    ('KST midnight reset', '_seconds_until_midnight_kst' in content),
    ('KST date in key', 'datetime.now(KST)' in content),
    ('fail-open pattern', 'except Exception' in content and 'allowing request' in content),
    ('returns 3-tuple', 'tuple[bool, int, int]' in content),
    ('ticker param', 'ticker: str' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Rate limiter issues: {failed}')
    sys.exit(1)
print(f'PASS: All {len(checks)} rate limiter checks passed')
"
```

**위반:** SET 대신 INCR/DECR을 사용하면 동일 ticker가 여러 번 카운트됩니다. KST가 아닌 UTC를 사용하면 한국 시간 기준 자정 리셋이 안 됩니다. fail-open이 없으면 Redis 장애 시 모든 분석이 차단됩니다.

### Step 2: 분석 엔드포인트 rate limit 적용 범위 검증

**파일:** `backend/src/api/routes/analysis.py`

**검사:** 4개 대상 엔드포인트(`/{ticker}`, `/{ticker}/score`, `/{ticker}/ohlcv`, `/{ticker}/financials`)에 `_check_rate_limit` 호출이 있고, `/search`에는 없어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
with open('backend/src/api/routes/analysis.py', encoding='utf-8') as f:
    content = f.read()
# Count actual _check_rate_limit calls (await prefix distinguishes from definition)
calls = content.count('await _check_rate_limit(')
if calls < 4:
    print(f'FAIL: Only {calls} _check_rate_limit calls (expected 4 for ticker endpoints)')
    sys.exit(1)
# Verify search endpoint does NOT have rate limiting
search_section = content[content.find('def search_stocks'):content.find('def search_stocks') + 500]
if '_check_rate_limit' in search_section:
    print('FAIL: /search endpoint should NOT be rate limited')
    sys.exit(1)
# Verify get_current_user_optional is used
if 'get_current_user_optional' not in content:
    print('FAIL: get_current_user_optional dependency missing')
    sys.exit(1)
print(f'PASS: {actual_calls} endpoints rate-limited, /search exempt, optional auth present')
"
```

**위반:** rate limit 호출이 4개 미만이면 일부 엔드포인트가 무제한입니다. `/search`에 rate limit이 있으면 자동완성이 차단되어 UX가 나빠집니다.

### Step 3: 429 응답 구조 검증

**파일:** `backend/src/api/routes/analysis.py`

**검사:** 429 응답에 `reset_seconds`, `limit`, `remaining`, `message` 필드가 포함되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/analysis.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('status 429', 'status_code=429' in content),
    ('reset_seconds field', '\"reset_seconds\"' in content),
    ('limit field', '\"limit\"' in content),
    ('remaining field', '\"remaining\"' in content),
    ('message field', '\"message\"' in content),
    ('X-RateLimit-Remaining header', '\"X-RateLimit-Remaining\"' in content),
    ('X-RateLimit-Limit header', '\"X-RateLimit-Limit\"' in content),
    ('X-RateLimit-Reset header', '\"X-RateLimit-Reset\"' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: 429 response structure issues: {failed}')
    sys.exit(1)
print(f'PASS: All {len(checks)} 429 response fields/headers present')
"
```

**위반:** `reset_seconds`가 없으면 프론트엔드 카운트다운이 표시 안 됩니다. rate limit 헤더가 없으면 프론트엔드에서 남은 횟수를 추적할 수 없습니다.

### Step 4: CORS expose_headers 검증

**파일:** `backend/src/api/app.py`

**검사:** CORS 설정에 `expose_headers`가 3개 rate limit 헤더를 모두 포함해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/app.py', encoding='utf-8') as f:
    content = f.read()
required = ['X-RateLimit-Remaining', 'X-RateLimit-Limit', 'X-RateLimit-Reset']
missing = [h for h in required if h not in content]
if missing:
    print(f'FAIL: Missing CORS expose_headers: {missing}')
    sys.exit(1)
if 'expose_headers' not in content:
    print('FAIL: expose_headers not found in CORS config')
    sys.exit(1)
print(f'PASS: All {len(required)} rate limit headers in CORS expose_headers')
"
```

**위반:** `expose_headers`가 없으면 브라우저가 커스텀 응답 헤더를 읽을 수 없어, 프론트엔드의 `res.headers.get("X-RateLimit-Remaining")`이 항상 `null`을 반환합니다.

### Step 5: settings.py rate limit 설정 검증

**파일:** `backend/src/config/settings.py`

**검사:** `analysis_rate_limit` 설정이 존재하고 양의 정수여야 합니다.

```bash
cd "I:\Project\AutoStock" && grep -n "analysis_rate_limit" backend/src/config/settings.py
```

**PASS:** `analysis_rate_limit: int = 5` 존재.

**위반:** 설정이 없으면 `settings.analysis_rate_limit` 접근 시 `AttributeError`가 발생합니다.

### Step 6: 프론트엔드 RateLimitError 클래스 검증

**파일:** `frontend/src/lib/api.ts`

**검사:** `RateLimitError` 클래스가 `limit`, `remaining`, `resetSeconds` 필드를 갖고, `fetchJSON`에서 429 시 throw되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('frontend/src/lib/api.ts', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('RateLimitError class', 'class RateLimitError extends Error' in content),
    ('limit field', 'this.limit = limit' in content or 'limit: number' in content),
    ('remaining field', 'this.remaining = remaining' in content or 'remaining: number' in content),
    ('resetSeconds field', 'this.resetSeconds = resetSeconds' in content or 'resetSeconds: number' in content),
    ('429 check in fetchJSON', 'res.status === 429' in content),
    ('throw RateLimitError', 'throw new RateLimitError' in content),
    ('getAnalysisRemaining export', 'export function getAnalysisRemaining' in content),
    ('getAnalysisResetSeconds export', 'export function getAnalysisResetSeconds' in content),
    ('X-RateLimit-Remaining header read', 'X-RateLimit-Remaining' in content),
    ('X-RateLimit-Reset header read', 'X-RateLimit-Reset' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Frontend rate limit issues: {failed}')
    sys.exit(1)
print(f'PASS: All {len(checks)} frontend rate limit checks passed')
"
```

**위반:** `RateLimitError`가 없으면 429 응답이 일반 에러로 처리되어 로그인 유도 UI가 표시되지 않습니다. `resetSeconds`가 없으면 카운트다운이 작동하지 않습니다.

### Step 7: 프론트엔드 rate limit UI 검증

**파일:** `frontend/src/app/search/page.tsx`, `frontend/src/app/analysis/[ticker]/page.tsx`

**검사:** 두 페이지 모두 `RateLimitError`를 import하고, 429 시 `RateLimitBanner` 또는 동등한 로그인 유도 UI를 표시해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
files = {
    'frontend/src/app/search/page.tsx': [
        ('RateLimitError import', 'RateLimitError'),
        ('RateLimitBanner component', 'RateLimitBanner'),
        ('ResetCountdown component', 'ResetCountdown'),
        ('getAnalysisRemaining import', 'getAnalysisRemaining'),
        ('remaining badge', 'remaining'),
        ('login prompt', 'login'),
    ],
    'frontend/src/app/analysis/[ticker]/page.tsx': [
        ('RateLimitError import', 'RateLimitError'),
        ('RateLimitBanner component', 'RateLimitBanner'),
        ('429 retry skip', 'instanceof RateLimitError'),
    ],
}
all_ok = True
for filepath, checks in files.items():
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    failed = [name for name, pattern in checks if pattern not in content]
    if failed:
        print(f'FAIL: {filepath}: missing {failed}')
        all_ok = False
    else:
        print(f'PASS: {filepath}: all {len(checks)} UI checks passed')
if not all_ok:
    sys.exit(1)
"
```

**위반:** `RateLimitBanner`가 없으면 429 시 빈 화면 또는 일반 에러 메시지만 표시되어 사용자가 왜 분석이 안 되는지 알 수 없습니다.

### Step 8: fetchJSON Authorization 헤더 전달 검증

**파일:** `frontend/src/lib/api.ts`

**검사:** `fetchJSON`에서 `_accessToken`이 있으면 `Authorization: Bearer` 헤더를 전달해야 합니다. 이를 통해 로그인 사용자는 rate limit을 우회합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('frontend/src/lib/api.ts', encoding='utf-8') as f:
    content = f.read()
# Find fetchJSON function and check for Authorization header
fetchjson_start = content.find('async function fetchJSON')
fetchjson_end = content.find('async function fetchWithAuth')
if fetchjson_start == -1:
    print('FAIL: fetchJSON function not found')
    sys.exit(1)
fetchjson_body = content[fetchjson_start:fetchjson_end] if fetchjson_end > fetchjson_start else content[fetchjson_start:fetchjson_start+500]
if 'Authorization' not in fetchjson_body or 'Bearer' not in fetchjson_body:
    print('FAIL: fetchJSON does not send Authorization header — logged-in users will be rate limited')
    sys.exit(1)
if '_accessToken' not in fetchjson_body:
    print('FAIL: fetchJSON does not check _accessToken')
    sys.exit(1)
print('PASS: fetchJSON sends Authorization header when token available')
"
```

**위반:** `fetchJSON`에서 `Authorization` 헤더를 보내지 않으면, 로그인한 사용자도 백엔드에서 `user=None`으로 인식되어 비로그인과 동일하게 rate limit이 적용됩니다.

## Output Format

```markdown
| # | 검사 항목 | 결과 | 상세 |
|---|----------|------|------|
| 1 | Redis rate limiter 핵심 로직 | PASS/FAIL | SET, KST, fail-open |
| 2 | 엔드포인트 rate limit 적용 범위 | PASS/FAIL | N개 적용, /search 면제 |
| 3 | 429 응답 구조 | PASS/FAIL | reset_seconds, limit, remaining, headers |
| 4 | CORS expose_headers | PASS/FAIL | 3개 헤더 노출 |
| 5 | settings rate limit 설정 | PASS/FAIL | analysis_rate_limit 존재 |
| 6 | FE RateLimitError 클래스 | PASS/FAIL | 필드, throw, 전역 추적 |
| 7 | FE rate limit UI | PASS/FAIL | search + analysis 페이지 |
| 8 | fetchJSON Authorization 헤더 | PASS/FAIL | 로그인 사용자 우회 |
```

## Exceptions

1. **로그인 사용자의 rate limit 헤더 미포함** — 로그인 사용자(`user is not None`)는 `_check_rate_limit`이 빈 헤더를 반환하므로 `X-RateLimit-*` 헤더가 응답에 없는 것이 정상
2. **`/search` 엔드포인트 rate limit 미적용** — 검색은 가벼운 요청이고 분석 비용이 발생하지 않으므로 무제한 허용이 의도된 설계
3. **Redis 장애 시 모든 요청 허용** — fail-open 패턴은 의도적 설계. 가용성을 보안보다 우선시하여 Redis 다운 시에도 서비스 중단을 방지
4. **`fetchJSON`의 `_accessToken` 전달** — `fetchJSON`은 공개 API용이지만 rate limit 우회를 위해 토큰을 전달하는 것이 정상. 이는 `fetchWithAuth`와 다른 목적 (인증 필수 vs 선택적 인증)
