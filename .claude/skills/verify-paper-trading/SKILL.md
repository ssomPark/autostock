---
name: verify-paper-trading
description: 모의 투자 잔고 일관성, 매수/매도 로직, 가격 fallback, DB 모델 제약, FE-BE API 동기화를 검증. 모의 투자 관련 코드 변경 후 사용.
---

## Purpose

1. **잔고 일관성 검증** — 매수 시 `cash_balance < total_cost` 검증이 존재하고, 잔고 부족 시 400 에러를 반환하는지 확인
2. **평균매수가 재계산 검증** — 추가 매수 시 `(old_total + new_cost) / new_quantity` 공식이 올바른지 확인
3. **매도 로직 검증** — 보유 수량 부족 검증, 실현손익 계산(`total_revenue - cost_basis`), 수량 0이면 포지션 삭제
4. **가격 fallback 검증** — 현재가 조회 실패 시 `avg_buy_price`로 대체하고, fallback 여부를 프론트엔드에 전달
5. **DB 모델 cascade 검증** — PaperAccount 삭제 시 Position/Trade가 cascade 삭제되는지 확인
6. **FE-BE API 동기화 검증** — 프론트엔드 API 함수가 백엔드 엔드포인트와 일치하는지 확인

## When to Run

- `backend/src/api/routes/paper_trading.py` 수정 후
- `backend/src/models/db_models.py`에서 PaperAccountModel, PaperPositionModel, PaperTradeModel 수정 후
- `frontend/src/lib/api.ts`에서 모의 투자 API 함수 수정 후
- `frontend/src/app/paper-trading/page.tsx` 수정 후
- `frontend/src/components/paper-trading/order-modal.tsx` 수정 후

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/api/routes/paper_trading.py` | 모의 투자 API 10개 엔드포인트 (계좌 CRUD, 매수/매도, 포지션, 거래이력, 요약) |
| `backend/src/models/db_models.py` | PaperAccountModel, PaperPositionModel, PaperTradeModel (FK, cascade, unique index) |
| `frontend/src/lib/api.ts` | 모의 투자 API 클라이언트 함수 (fetchWithAuth 사용) |
| `frontend/src/app/paper-trading/page.tsx` | 모의 투자 메인 페이지 (포트폴리오 뷰, 매수/매도 UI) |
| `frontend/src/components/paper-trading/order-modal.tsx` | 주문 모달 (수량 입력, 총 금액 계산, 추천 메타데이터) |
| `frontend/src/app/recommendations/page.tsx` | 추천 페이지 "모의 매수" 버튼 연동 |

## Workflow

### Step 1: 매수 잔고 검증 로직 확인

**파일:** `backend/src/api/routes/paper_trading.py`

**검사:** `execute_buy`에서 `account.cash_balance < total_cost` 검증이 있고, 부족 시 `HTTPException(status_code=400)`을 발생시켜야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/paper_trading.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('balance check', 'cash_balance < total_cost' in content or 'cash_balance <' in content),
    ('400 error on insufficient', 'status_code=400' in content and '잔고 부족' in content),
    ('cash deduction', 'cash_balance -= total_cost' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Missing balance validation: {failed}')
    sys.exit(1)
print('PASS: Buy balance validation present (check + 400 error + deduction)')
"
```

**위반:** 잔고 검증이 없으면 음수 잔고가 발생하여 데이터 무결성이 깨집니다.

### Step 2: 평균매수가 재계산 공식 검증

**파일:** `backend/src/api/routes/paper_trading.py`

**검사:** 추가 매수 시 `old_total + total_cost` / `new_quantity` 공식으로 평균매수가가 재계산되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
with open('backend/src/api/routes/paper_trading.py', encoding='utf-8') as f:
    content = f.read()
# Check for avg_buy_price recalculation pattern
has_old_total = 'avg_buy_price * position.quantity' in content or 'position.avg_buy_price * position.quantity' in content
has_new_qty = 'position.quantity + body.quantity' in content
has_recalc = 'avg_buy_price =' in content and 'new_quantity' in content
if not (has_old_total and has_new_qty):
    print('FAIL: Average buy price recalculation formula missing')
    print(f'  old_total pattern: {has_old_total}, new_qty pattern: {has_new_qty}')
    sys.exit(1)
print('PASS: Average buy price recalculation formula present')
"
```

**위반:** 재계산 공식이 잘못되면 포지션의 평균매수가가 실제 매수 이력과 일치하지 않아 손익 계산이 틀립니다.

### Step 3: 매도 수량 검증 및 포지션 삭제 로직

**파일:** `backend/src/api/routes/paper_trading.py`

**검사:** 매도 시 `position.quantity < body.quantity` 검증이 있고, 수량이 0이면 포지션을 삭제해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/paper_trading.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('qty check', 'position.quantity < body.quantity' in content),
    ('qty error msg', '보유 수량 부족' in content or '수량 부족' in content),
    ('delete on zero', 'quantity <= 0' in content and 'session.delete(position)' in content),
    ('qty subtract', 'position.quantity -= body.quantity' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Sell logic issues: {failed}')
    sys.exit(1)
print('PASS: Sell quantity validation + zero-position deletion present')
"
```

**위반:** 수량 검증이 없으면 음수 포지션이 발생하고, 0 포지션을 삭제하지 않으면 빈 포지션이 계속 표시됩니다.

### Step 4: 실현손익 계산 공식 검증

**파일:** `backend/src/api/routes/paper_trading.py`

**검사:** 매도 시 `realized_pnl = total_revenue - cost_basis`이고, `cost_basis = avg_buy_price * quantity`로 계산되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/paper_trading.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('total_revenue calc', 'body.quantity * body.price' in content),
    ('cost_basis calc', 'avg_buy_price * body.quantity' in content),
    ('realized_pnl calc', 'total_revenue - cost_basis' in content),
    ('realized_pnl_pct calc', 'realized_pnl / cost_basis' in content),
    ('cash add', 'cash_balance += total_revenue' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: PnL calculation issues: {failed}')
    sys.exit(1)
print('PASS: Realized PnL calculation formula correct')
"
```

**위반:** 손익 계산이 잘못되면 거래 이력의 수익률이 실제와 불일치합니다.

### Step 5: 가격 fallback 로직 검증

**파일:** `backend/src/api/routes/paper_trading.py`

**검사:** positions 및 summary 엔드포인트에서 현재가 조회 실패 시 `avg_buy_price`로 fallback 하고, `price_fallback` 플래그를 포함해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/paper_trading.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('positions fallback', 'current_price = pos.avg_buy_price' in content),
    ('summary fallback', 'pos.avg_buy_price * pos.quantity' in content),
    ('price_fallback flag', 'price_fallback' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: Price fallback issues: {failed}')
    sys.exit(1)
print('PASS: Price fallback to avg_buy_price with flag present')
"
```

**위반:** fallback이 없으면 가격 조회 실패 시 현재가=0, 평가금액=0으로 표시되어 수익률이 -100%로 오표시됩니다.

### Step 6: DB 모델 FK/Cascade 검증

**파일:** `backend/src/models/db_models.py`

**검사:** PaperAccount → Position/Trade 간 FK와 cascade 삭제가 설정되어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/models/db_models.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('PaperAccountModel exists', 'class PaperAccountModel' in content),
    ('PaperPositionModel exists', 'class PaperPositionModel' in content),
    ('PaperTradeModel exists', 'class PaperTradeModel' in content),
    ('position FK to account', 'paper_accounts.id' in content),
    ('trade FK to account', 'paper_accounts.id' in content),
    ('position cascade', 'positions' in content and 'delete-orphan' in content),
    ('position unique index', 'ix_paper_positions_account_ticker' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: DB model issues: {failed}')
    sys.exit(1)
print(f'PASS: All {len(checks)} DB model constraints verified')
"
```

**위반:** cascade가 없으면 계좌 삭제 시 고아 포지션/거래가 남고, unique index가 없으면 동일 종목 포지션이 중복 생성됩니다.

### Step 7: FE-BE API 함수 동기화 검증

**파일:** `frontend/src/lib/api.ts`, `backend/src/api/routes/paper_trading.py`

**검사:** 프론트엔드에 필수 API 함수가 모두 존재하고, 백엔드 엔드포인트와 경로가 일치해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('frontend/src/lib/api.ts', encoding='utf-8') as f:
    fe_content = f.read()
required_fns = [
    ('fetchPaperAccounts', '/api/paper/accounts'),
    ('createPaperAccount', '/api/paper/accounts'),
    ('deletePaperAccount', '/api/paper/accounts/'),
    ('resetPaperAccount', '/api/paper/accounts/'),
    ('executePaperBuy', '/api/paper/buy'),
    ('executePaperSell', '/api/paper/sell'),
    ('fetchPaperPositions', '/api/paper/positions/'),
    ('fetchPaperTrades', '/api/paper/trades/'),
    ('fetchPaperSummary', '/api/paper/summary/'),
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
print(f'PASS: All {len(required_fns)} paper trading API functions present with correct paths')
"
```

**위반:** API 함수가 누락되거나 경로가 불일치하면 프론트엔드에서 해당 기능이 작동하지 않습니다.

### Step 8: 계좌 소유권 검증 패턴

**파일:** `backend/src/api/routes/paper_trading.py`

**검사:** 모든 계좌 접근 엔드포인트에서 `_verify_account_owner`를 호출하여 타인 계좌 접근을 방지해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
with open('backend/src/api/routes/paper_trading.py', encoding='utf-8') as f:
    content = f.read()
# Count endpoints that take account_id
account_endpoints = len(re.findall(r'account_id.*int.*Depends\(get_current_user\)', content, re.DOTALL)[:20])
# Count _verify_account_owner calls
verify_calls = content.count('_verify_account_owner')
# _verify_account_owner definition counts as 1
verify_def = 1 if 'def _verify_account_owner' in content else 0
actual_calls = verify_calls - verify_def
# account_id in body also needs verify
body_account_endpoints = len(re.findall(r'body\.account_id', content))
total_needing = len(re.findall(r'(account_id.*:.*int|body\.account_id)', content))
if actual_calls < 6:
    print(f'WARN: Only {actual_calls} _verify_account_owner calls (expected >= 6 for account-accessing endpoints)')
else:
    print(f'PASS: {actual_calls} _verify_account_owner calls for account access control')
"
```

**위반:** 소유권 검증이 빠지면 인증된 사용자가 타인의 모의 투자 계좌/포지션에 접근할 수 있습니다.

## Output Format

```markdown
| # | 검사 항목 | 결과 | 상세 |
|---|----------|------|------|
| 1 | 매수 잔고 검증 | PASS/FAIL | balance check + 400 error |
| 2 | 평균매수가 재계산 | PASS/FAIL | (old + new) / total_qty |
| 3 | 매도 수량 검증 + 포지션 삭제 | PASS/FAIL | qty check, zero delete |
| 4 | 실현손익 계산 | PASS/FAIL | revenue - cost_basis |
| 5 | 가격 fallback | PASS/FAIL | avg_buy_price fallback + flag |
| 6 | DB 모델 FK/Cascade | PASS/FAIL | FK, cascade, unique index |
| 7 | FE-BE API 동기화 | PASS/FAIL | 함수 N개, 경로 일치 |
| 8 | 계좌 소유권 검증 | PASS/FAIL | _verify_account_owner 호출 수 |
```

## Exceptions

1. **테스트 코드에서의 잔고 조작** — 테스트에서 잔고를 직접 변경하는 것은 허용 (프로덕션 코드만 검증 대상)
2. **price=0 매수 요청** — 현재가 자동 조회를 위해 `price=0`으로 요청하는 것은 정상 패턴. `execute_buy`에서 자동으로 현재가를 조회함
3. **source="recommendation" 매도** — 현재 매도는 항상 `source="manual"`. 추천 연동 매도는 Phase 2에서 구현 예정이므로 위반이 아님
