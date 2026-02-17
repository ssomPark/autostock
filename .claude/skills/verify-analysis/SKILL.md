---
name: verify-analysis
description: Backend 분석 모듈의 핵심 규칙(신호 가중치, numpy 직렬화, ScoringEngine 계약, 신뢰도 범위)을 검증. 분석 로직 변경 후 사용.
---

## Purpose

1. **신호 가중치 합산 검증** — ScoringEngine.SIGNAL_WEIGHTS와 SignalAggregator.DEFAULT_WEIGHTS가 각각 1.0으로 합산되는지 확인
2. **numpy 직렬화 안전성** — 분석 결과를 반환하는 모든 API 엔드포인트에서 `_sanitize()` 래핑이 빠지지 않았는지 확인
3. **ScoringEngine 출력 계약** — `compute()` 반환 dict에 필수 키가 모두 존재하는지 확인
4. **신뢰도 범위 보장** — `_enhanced_confidence`에서 최종 confidence가 5~95% 범위로 클램핑되는지 확인
5. **S/R strength 일관성** — support_resistance의 strength 값이 [-1.0, 1.0] 범위 내에 있는지 확인

## When to Run

- `backend/src/analysis/scoring_engine.py` 수정 후
- `backend/src/analysis/signal_aggregator.py` 수정 후
- `backend/src/analysis/support_resistance.py` 또는 `volume_analysis.py` 수정 후
- `backend/src/api/routes/analysis.py`에서 분석 엔드포인트 추가/수정 후
- `backend/src/api/routes/n8n.py`에서 aggregate 엔드포인트 또는 ScoringEngine 호출 수정 후
- 신호 가중치나 등급 기준 변경 후

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/analysis/scoring_engine.py` | 종합 점수 엔진 (SIGNAL_WEIGHTS, confidence, grade, compute 반환값) |
| `backend/src/analysis/signal_aggregator.py` | 신호 합산기 (DEFAULT_WEIGHTS, THRESHOLDS) |
| `backend/src/analysis/support_resistance.py` | 지지/저항 분석 (strength 범위) |
| `backend/src/analysis/volume_analysis.py` | 거래량 분석 (score 계산) |
| `backend/src/analysis/candlestick_patterns.py` | 캔들스틱 패턴 탐지 |
| `backend/src/analysis/chart_patterns.py` | 차트 패턴 탐지 |
| `backend/src/api/routes/analysis.py` | 분석 API 라우트 (_sanitize 사용, ScoringEngine 호출) |
| `backend/src/api/routes/n8n.py` | N8N 파이프라인 연동 (aggregate 엔드포인트에서 ScoringEngine, SignalAggregator 사용) |

## Workflow

### Step 1: ScoringEngine SIGNAL_WEIGHTS 합산 검증

**파일:** `backend/src/analysis/scoring_engine.py`

**검사:** `SIGNAL_WEIGHTS` dict의 모든 값을 합산하면 정확히 1.0이어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import ast, sys
with open('backend/src/analysis/scoring_engine.py', encoding='utf-8') as f:
    tree = ast.parse(f.read())
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == 'ScoringEngine':
        for item in node.body:
            if isinstance(item, ast.Assign):
                for t in item.targets:
                    if isinstance(t, ast.Name) and t.id == 'SIGNAL_WEIGHTS':
                        vals = [elt.value for elt in item.value.values if isinstance(elt, ast.Constant)]
                        total = sum(vals)
                        if abs(total - 1.0) > 0.001:
                            print(f'FAIL: SIGNAL_WEIGHTS sum = {total} (expected 1.0)')
                            sys.exit(1)
                        print(f'PASS: SIGNAL_WEIGHTS sum = {total}')
                        sys.exit(0)
print('FAIL: SIGNAL_WEIGHTS not found')
sys.exit(1)
"
```

**위반:** 합산이 1.0이 아닌 경우. 가중치를 추가/제거할 때 나머지 값도 조정 필요.

### Step 2: SignalAggregator DEFAULT_WEIGHTS 합산 검증

**파일:** `backend/src/analysis/signal_aggregator.py`

**검사:** `DEFAULT_WEIGHTS` dict의 모든 값을 합산하면 정확히 1.0이어야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import ast, sys
with open('backend/src/analysis/signal_aggregator.py', encoding='utf-8') as f:
    tree = ast.parse(f.read())
for node in ast.walk(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == 'DEFAULT_WEIGHTS':
                vals = [elt.value for elt in node.value.values if isinstance(elt, ast.Constant)]
                total = sum(vals)
                if abs(total - 1.0) > 0.001:
                    print(f'FAIL: DEFAULT_WEIGHTS sum = {total} (expected 1.0)')
                    sys.exit(1)
                print(f'PASS: DEFAULT_WEIGHTS sum = {total}')
                sys.exit(0)
print('FAIL: DEFAULT_WEIGHTS not found')
sys.exit(1)
"
```

**위반:** 합산이 1.0이 아닌 경우. N8N 파이프라인의 aggregate 엔드포인트에서도 동일 가중치를 사용하므로 양쪽 동기화 필요.

### Step 3: _sanitize() 래핑 검증

**파일:** `backend/src/api/routes/analysis.py`

**검사:** 분석 결과를 반환하는 모든 엔드포인트에서 Detector/Engine 결과가 `_sanitize()`로 래핑되어야 합니다. numpy 타입이 JSON 직렬화 오류를 발생시키기 때문입니다.

```bash
cd "I:\Project\AutoStock" && grep -n "Detector\|ScoringEngine\|Analyzer" backend/src/api/routes/analysis.py | grep -v "_sanitize\|import\|#"
```

**PASS:** 출력이 비어있으면 모든 호출이 `_sanitize()`로 래핑됨.

**위반:** Detector/ScoringEngine/Analyzer 호출 결과가 `_sanitize()` 없이 직접 반환되면 numpy float/int가 JSON 직렬화 실패를 유발합니다. `_sanitize(...)` 래핑을 추가하세요.

### Step 4: ScoringEngine compute() 반환값 필수 키 검증

**파일:** `backend/src/analysis/scoring_engine.py`

**검사:** `compute()` 메서드의 반환 dict에 다음 필수 키가 모두 있어야 합니다: `signal`, `grade`, `confidence`, `current_price`, `entry_price`, `target`, `stop_loss`, `risk_reward_ratio`, `summary`, `indicators`, `signal_breakdown`, `total_score`, `details`.

```bash
cd "I:\Project\AutoStock" && grep -A 30 "return {" backend/src/analysis/scoring_engine.py | tail -30
```

다음 키가 모두 반환 dict에 있는지 확인합니다:

```bash
cd "I:\Project\AutoStock" && python -c "
required = ['signal','grade','confidence','current_price','entry_price','target','stop_loss','risk_reward_ratio','summary','indicators','signal_breakdown','total_score','details']
with open('backend/src/analysis/scoring_engine.py', encoding='utf-8') as f:
    content = f.read()
# Find last return { in compute method
import re
matches = re.findall(r'\"(\w+)\":', content[content.rfind('return {'):])
found = [k for k in matches]
missing = [k for k in required if k not in found]
if missing:
    print(f'FAIL: Missing keys in compute() return: {missing}')
else:
    print(f'PASS: All {len(required)} required keys present')
"
```

**위반:** 필수 키가 누락되면 프론트엔드 `search/page.tsx`와 N8N 파이프라인에서 `undefined` 참조 오류가 발생합니다.

### Step 5: 신뢰도 범위 클램핑 검증

**파일:** `backend/src/analysis/scoring_engine.py`

**검사:** `_enhanced_confidence` 메서드에서 최종 confidence가 `max(5, min(95, ...))` 패턴으로 클램핑되어야 합니다.

```bash
cd "I:\Project\AutoStock" && grep -n "max(5, min(95" backend/src/analysis/scoring_engine.py
```

**PASS:** 매칭 라인이 1개 이상 존재.

**위반:** 클램핑이 없으면 confidence가 0% 이하 또는 100% 이상이 될 수 있어 프론트엔드 게이지/프로그레스바가 오작동합니다.

### Step 6: S/R strength 범위 검증

**파일:** `backend/src/analysis/support_resistance.py`

**검사:** strength 값이 `min(1.0, ...)` 및 `-min(1.0, ...)`로 제한되어 [-1.0, 1.0] 범위를 벗어나지 않아야 합니다.

```bash
cd "I:\Project\AutoStock" && grep -n "min(1.0\|min(0.8" backend/src/analysis/support_resistance.py
```

**PASS:** `min(1.0, ...)` 패턴이 BUY/SELL 양쪽에 모두 존재하고, `min(0.8, ...)`이 없어야 합니다 (0.8 cap은 신호 약화 버그).

**위반:** strength cap이 불일치하면 BUY vs SELL 신호 강도에 비대칭이 생겨 scoring 편향이 발생합니다.

### Step 7: volume_analysis divergence 부호 검증

**파일:** `backend/src/analysis/volume_analysis.py`

**검사:** `price_volume_divergence` 시 score에 곱하는 값이 `0.5`(절대값 감소)이어야 하며, `-0.5`(부호 반전)이면 안 됩니다.

```bash
cd "I:\Project\AutoStock" && grep -n "divergence" -A 1 backend/src/analysis/volume_analysis.py | grep "score \*="
```

**PASS:** `score *= 0.5`

**위반:** `score *= -0.5`는 다이버전스 시 신호 방향을 반전시켜 BUY→SELL 오판을 유발합니다. 의도는 신호 강도 약화(절대값 감소)입니다.

### Step 8: 등급 기준 일관성 검증

**파일:** `backend/src/analysis/scoring_engine.py`

**검사:** `_assign_grade` 메서드의 등급 경계가 `A+(>=80) > A(>=70) > B+(>=60) > B(>=50) > C(>=40) > D(>=25) > F` 순서로 내림차순이어야 합니다.

```bash
cd "I:\Project\AutoStock" && grep -A 15 "_assign_grade" backend/src/analysis/scoring_engine.py | grep "score >="
```

**위반:** 경계값이 순서대로가 아니거나 겹치면 등급 할당이 잘못됩니다.

### Step 9: N8N aggregate 엔드포인트의 ScoringEngine 출력 키 검증

**파일:** `backend/src/api/routes/n8n.py`

**검사:** aggregate 엔드포인트에서 `ScoringEngine.compute()` 결과 접근 시, `compute()`가 실제로 반환하는 키만 사용해야 합니다. 현재 접근하는 키: `grade`, `confidence.final`, `risk_reward_ratio`.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
with open('backend/src/api/routes/n8n.py', encoding='utf-8') as f:
    content = f.read()
# Find score_result.get() calls
gets = re.findall(r'score_result\.get\([\"\\'](\w+)[\"\\']', content)
if not gets:
    print('SKIP: ScoringEngine not used in n8n.py')
    sys.exit(0)
# Verify these keys exist in compute() output
required_in_compute = ['grade', 'confidence', 'risk_reward_ratio']
with open('backend/src/analysis/scoring_engine.py', encoding='utf-8') as f:
    engine_content = f.read()
compute_return = engine_content[engine_content.rfind('return {'):]
missing = [k for k in gets if k not in compute_return]
if missing:
    print(f'FAIL: n8n.py accesses keys not in compute() return: {missing}')
    sys.exit(1)
print(f'PASS: All {len(gets)} accessed keys ({gets}) exist in compute() return')
"
```

**위반:** `n8n.py`가 `compute()`에 없는 키를 `.get()`하면 항상 `None`을 반환하여 등급/신뢰도가 누락됩니다.

## Output Format

```markdown
| # | 검사 항목 | 결과 | 상세 |
|---|----------|------|------|
| 1 | ScoringEngine SIGNAL_WEIGHTS 합산 | PASS/FAIL | sum = X.XX |
| 2 | SignalAggregator DEFAULT_WEIGHTS 합산 | PASS/FAIL | sum = X.XX |
| 3 | _sanitize() 래핑 | PASS/FAIL | 미래핑 N건 |
| 4 | compute() 필수 키 | PASS/FAIL | 누락: [...] |
| 5 | 신뢰도 범위 클램핑 | PASS/FAIL | max(5, min(95, ...)) |
| 6 | S/R strength 범위 | PASS/FAIL | cap = X.X |
| 7 | volume divergence 부호 | PASS/FAIL | *= X.X |
| 8 | 등급 기준 순서 | PASS/FAIL | 경계값 목록 |
| 9 | N8N aggregate ScoringEngine 키 | PASS/FAIL/SKIP | 접근 키 목록 |
```

## Exceptions

1. **테스트 파일에서의 가중치 변경** — 테스트 코드에서 가중치를 임의로 설정하는 것은 허용 (프로덕션 코드만 검증 대상)
2. **_sanitize() 미사용 내부 헬퍼** — API 응답이 아닌 내부 계산용 함수는 _sanitize() 불필요 (예: `_get_fundamentals` 내부 dict)
3. **SIGNAL_WEIGHTS vs DEFAULT_WEIGHTS 키 불일치** — 두 dict는 목적이 다르므로 키가 다를 수 있음 (ScoringEngine은 기술적 지표 6개, SignalAggregator는 뉴스 포함 5개)
