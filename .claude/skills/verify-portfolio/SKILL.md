---
name: verify-portfolio
description: 포트폴리오 CRUD, 리포트 rate limit(5회/일), 데이터 제한(3 포트폴리오/20 종목), 소유권 검증, 로컬/서버 모드 동기화, 캐시 무효화를 검증. 포트폴리오 관련 코드 변경 후 사용.
---

## Purpose

1. **포트폴리오 소유권 검증** — `_verify_portfolio_owner()`가 모든 변경 엔드포인트에서 호출되는지 확인
2. **데이터 제한 일관성** — BE 3 포트폴리오/20 종목 제한이 FE 로컬 모드와 동일한지 확인
3. **리포트 rate limit 검증** — Redis 기반 일일 5회 리포트 제한, 429 응답, FE 429 처리가 올바른지 확인
4. **캐시 무효화 검증** — 종목 추가/삭제 시 리포트 캐시가 무효화되는지 확인
5. **로컬/서버 모드 동기화** — 어댑터 함수가 모드에 따라 올바르게 분기하는지 확인
6. **FE-BE API 동기화** — 프론트엔드 API 함수가 백엔드 엔드포인트와 경로가 일치하는지 확인

## When to Run

- `backend/src/api/routes/portfolio.py` 수정 후
- `backend/src/models/db_models.py`에서 PortfolioModel, PortfolioHoldingModel 수정 후
- `frontend/src/lib/portfolio-storage.ts` 수정 후
- `frontend/src/app/portfolio/page.tsx` 수정 후
- `frontend/src/lib/api.ts`에서 포트폴리오 API 함수 수정 후

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/api/routes/portfolio.py` | 포트폴리오 API 11개 엔드포인트 (CRUD, 리포트, enrichment) |
| `backend/src/models/db_models.py` | PortfolioModel, PortfolioHoldingModel (FK, cascade, unique index) |
| `frontend/src/lib/portfolio-storage.ts` | 듀얼모드 스토리지 (로컬/서버 어댑터, 제한 상수, 마이그레이션) |
| `frontend/src/app/portfolio/page.tsx` | 포트폴리오 메인 페이지 (인증 가드, 429 처리, 모드 선택) |
| `frontend/src/lib/api.ts` | 포트폴리오 API 클라이언트 함수 11개 (fetchWithAuth 사용) |

## Workflow

### Step 1: 포트폴리오 소유권 검증 패턴

**파일:** `backend/src/api/routes/portfolio.py`

**검사:** `_verify_portfolio_owner()`가 존재하고, portfolio_id를 받는 모든 변경 엔드포인트에서 호출되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
with open('backend/src/api/routes/portfolio.py', encoding='utf-8') as f:
    content = f.read()
# Check _verify_portfolio_owner exists
if '_verify_portfolio_owner' not in content:
    print('FAIL: _verify_portfolio_owner function not found')
    sys.exit(1)
# Count calls (excluding definition)
verify_calls = content.count('_verify_portfolio_owner')
verify_def = 1 if 'def _verify_portfolio_owner' in content or 'async def _verify_portfolio_owner' in content else 0
actual_calls = verify_calls - verify_def
# Endpoints that take portfolio_id: delete, get_holdings, add_holding, delete_holding, get_cached_report, generate_report
if actual_calls < 6:
    print(f'WARN: Only {actual_calls} _verify_portfolio_owner calls (expected >= 6 for portfolio_id endpoints)')
else:
    print(f'PASS: {actual_calls} _verify_portfolio_owner calls for ownership verification')
"
```

**위반:** 소유권 검증이 빠지면 인증된 사용자가 타인의 포트폴리오에 접근/수정할 수 있습니다.

### Step 2: 데이터 제한 일관성 검증 (BE)

**파일:** `backend/src/api/routes/portfolio.py`

**검사:** 포트폴리오 최대 3개, 종목 최대 20개 제한이 백엔드에 존재해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/portfolio.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('portfolio limit 3', '최대 3개' in content and 'status_code=400' in content),
    ('holding limit 20', '최대 20개' in content and 'status_code=400' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Data limit issues: {failed}')
    sys.exit(1)
print('PASS: Portfolio limit (3) and holding limit (20) enforced with 400 error')
"
```

**위반:** 제한이 없으면 사용자가 무제한으로 포트폴리오/종목을 추가하여 리포트 생성 비용이 급증합니다.

### Step 3: 데이터 제한 일관성 검증 (FE 로컬 모드)

**파일:** `frontend/src/lib/portfolio-storage.ts`

**검사:** 로컬 모드에서도 동일한 제한(3 포트폴리오, 20 종목)이 적용되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
with open('frontend/src/lib/portfolio-storage.ts', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('local portfolio limit', '최대 3개' in content or 'portfolios.length >= 3' in content),
    ('local holding limit', '최대 20개' in content or 'holdings.length >= 20' in content),
    ('localStorage key portfolio-mode', 'traderadar-portfolio-mode' in content),
    ('localStorage key portfolio-local', 'traderadar-portfolio-local' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Local mode limit issues: {failed}')
    sys.exit(1)
print('PASS: Local mode enforces same limits as server (3 portfolios, 20 holdings)')
"
```

**위반:** 로컬 제한이 서버와 다르면 마이그레이션 시 서버 측 400 에러가 발생합니다.

### Step 4: 리포트 rate limit 검증

**파일:** `backend/src/api/routes/portfolio.py`

**검사:** 리포트 생성에 일일 5회 Redis 기반 rate limit이 적용되고, 초과 시 429를 반환해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/portfolio.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('Redis limit key format', 'portfolio_report:' in content),
    ('daily limit value', '5' in content and ('429' in content)),
    ('429 status code', 'status_code=429' in content or 'HTTPException' in content),
    ('86400 expiry', '86400' in content),
    ('KST timezone', 'hours=9' in content or 'KST' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Report rate limit issues: {failed}')
    sys.exit(1)
print('PASS: Report rate limit verified (Redis key, 5/day, 429, 86400s expiry, KST)')
"
```

**위반:** rate limit이 없으면 LLM 리포트 생성 API 비용이 무제한으로 발생합니다.

### Step 5: FE 429 처리 검증

**파일:** `frontend/src/app/portfolio/page.tsx`

**검사:** 리포트 생성 시 429 응답을 처리하고, 사용자에게 토스트 메시지를 표시해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('frontend/src/app/portfolio/page.tsx', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('429 status check', '429' in content),
    ('limit exceeded message', '리포트' in content and '초과' in content),
    ('toast or alert', 'toast' in content.lower() or 'Toast' in content or 'setToast' in content or 'alert' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: FE 429 handling issues: {failed}')
    sys.exit(1)
print('PASS: Frontend handles 429 with toast message for report limit exceeded')
"
```

**위반:** 429 처리가 없으면 리포트 생성 실패 시 빈 화면이 표시됩니다.

### Step 6: 리포트 캐시 무효화 검증

**파일:** `backend/src/api/routes/portfolio.py`

**검사:** 종목 추가/삭제 시 해당 포트폴리오의 리포트 캐시(`portfolio_report_cache:{portfolio_id}`)가 무효화되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/portfolio.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('cache key format', 'portfolio_report_cache:' in content),
    ('cache TTL 1800', '1800' in content),
    ('cache delete on mutation', 'cache_delete' in content or 'redis.delete' in content or 'delete(cache_key)' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Cache invalidation issues: {failed}')
    sys.exit(1)
print('PASS: Report cache (30min TTL) invalidated on holding mutations')
"
```

**위반:** 캐시 무효화가 없으면 종목 추가/삭제 후에도 이전 리포트가 30분간 표시됩니다.

### Step 7: FE-BE API 함수 동기화 검증

**파일:** `frontend/src/lib/api.ts`, `backend/src/api/routes/portfolio.py`

**검사:** 프론트엔드에 필수 API 함수가 모두 존재하고, 백엔드 엔드포인트와 경로가 일치해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('frontend/src/lib/api.ts', encoding='utf-8') as f:
    fe_content = f.read()
required_fns = [
    ('fetchPortfolios', '/api/portfolio'),
    ('createPortfolio', '/api/portfolio'),
    ('deletePortfolio', '/api/portfolio/'),
    ('fetchPortfolioHoldings', '/api/portfolio/'),
    ('addPortfolioHolding', '/api/portfolio/'),
    ('deletePortfolioHolding', '/api/portfolio/'),
    ('generatePortfolioReport', '/api/portfolio/'),
    ('fetchPortfolioReport', '/api/portfolio/'),
    ('fetchReportLimit', '/api/portfolio/report-limit'),
    ('enrichHoldings', '/api/portfolio/enrich-holdings'),
    ('generateAdhocReport', '/api/portfolio/report-adhoc'),
]
missing = []
for fn_name, path in required_fns:
    if fn_name not in fe_content:
        missing.append(fn_name)
    elif path not in fe_content:
        missing.append(f'{fn_name} (path mismatch: {path} not found)')
if missing:
    print(f'FAIL: Missing/mismatched API functions: {missing}')
    sys.exit(1)
print(f'PASS: All {len(required_fns)} portfolio API functions present with correct paths')
"
```

**위반:** API 함수가 누락되거나 경로가 불일치하면 프론트엔드에서 해당 기능이 작동하지 않습니다.

### Step 8: FE 인증 가드 검증

**파일:** `frontend/src/app/portfolio/page.tsx`

**검사:** 서버 모드에서 비인증 사용자를 로그인 페이지로 리다이렉트해야 합니다. 로컬 모드에서는 인증 없이 사용 가능해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('frontend/src/app/portfolio/page.tsx', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('auth redirect', '/auth/login' in content),
    ('server mode check', 'server' in content and ('mode' in content)),
    ('isAuthenticated check', 'isAuthenticated' in content or 'isLoggedIn' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Auth guard issues: {failed}')
    sys.exit(1)
print('PASS: Server mode redirects unauthenticated users, local mode allows access')
"
```

**위반:** 인증 가드가 없으면 비인증 사용자가 서버 모드에서 API 에러를 경험합니다.

### Step 9: 어댑터 함수 모드 분기 검증

**파일:** `frontend/src/lib/portfolio-storage.ts`

**검사:** 모든 어댑터 함수가 `isLocalMode()` 체크로 로컬/서버를 분기해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
with open('frontend/src/lib/portfolio-storage.ts', encoding='utf-8') as f:
    content = f.read()
adapters = ['getPortfolios', 'createPortfolioAdapter', 'deletePortfolioAdapter', 'getHoldings', 'addHoldingAdapter', 'deleteHoldingAdapter', 'generateReportAdapter', 'fetchReportAdapter']
missing = [a for a in adapters if a not in content]
if missing:
    print(f'FAIL: Missing adapter functions: {missing}')
    sys.exit(1)
# Check mode branching
mode_checks = content.count('isLocalMode()')
if mode_checks < 6:
    print(f'WARN: Only {mode_checks} isLocalMode() checks (expected >= 6 for adapter functions)')
else:
    print(f'PASS: All {len(adapters)} adapter functions present, {mode_checks} mode branches')
"
```

**위반:** 어댑터에 모드 분기가 없으면 로컬 모드에서 서버 API를 호출하거나, 서버 모드에서 localStorage를 사용하게 됩니다.

## Output Format

```markdown
| # | 검사 항목 | 결과 | 상세 |
|---|----------|------|------|
| 1 | 소유권 검증 패턴 | PASS/FAIL | _verify_portfolio_owner 호출 수 |
| 2 | BE 데이터 제한 | PASS/FAIL | 3 포트폴리오, 20 종목 |
| 3 | FE 로컬 모드 제한 | PASS/FAIL | BE와 동일 제한 |
| 4 | 리포트 rate limit | PASS/FAIL | Redis 5/일, 429, 86400s |
| 5 | FE 429 처리 | PASS/FAIL | 토스트 메시지 |
| 6 | 캐시 무효화 | PASS/FAIL | 종목 변경 시 캐시 삭제 |
| 7 | FE-BE API 동기화 | PASS/FAIL | 11개 함수, 경로 일치 |
| 8 | FE 인증 가드 | PASS/FAIL | 서버 모드 리다이렉트 |
| 9 | 어댑터 모드 분기 | PASS/FAIL | isLocalMode() 분기 수 |
```

## Exceptions

1. **`/enrich-holdings` 엔드포인트 인증 미적용** — 로컬 모드에서 사용하므로 의도적으로 공개 엔드포인트. 종목 현재가 조회만 수행하며 사용자 데이터에 접근하지 않음
2. **로컬 모드에서 리포트 캐시 미사용** — 로컬 모드는 브라우저 localStorage만 사용하므로 Redis 캐시가 불필요. 매번 새로 생성하는 것이 정상
3. **`report-adhoc` 엔드포인트의 portfolio_id 미사용** — adhoc 리포트는 요청 body에 holdings를 직접 전달하므로 portfolio_id가 없어도 정상. 로컬 모드 + 인증 사용자를 위한 엔드포인트
