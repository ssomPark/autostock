---
name: verify-news
description: 뉴스 분석 모듈의 핵심 규칙(감성 키워드 일관성, NEWS_TOPIC_MAP 구조, API 응답 필드, 프론트엔드 감성 타입 동기화)을 검증. 뉴스 분석/표시 로직 변경 후 사용.
---

## Purpose

1. **감성 키워드 중복/누락 검증** — POSITIVE_KEYWORDS와 NEGATIVE_KEYWORDS 간 중복이 없고, 각 리스트가 비어있지 않은지 확인
2. **NEWS_TOPIC_MAP 구조 검증** — 모든 엔트리가 `{ticker, market, name}` 필수 키를 갖는지 확인
3. **NewsService enrichment 검증** — `_enrich_articles()`가 `related_stocks`, `sentiment`, `sentiment_score` 3개 필드를 모두 추가하는지 확인
4. **감성 score 범위 검증** — `_analyze_sentiment()`의 반환값이 -1.0 ~ 1.0 범위이고 sentiment 라벨이 3종(`positive`, `negative`, `neutral`) 중 하나인지 확인
5. **프론트엔드-백엔드 감성 타입 동기화** — 프론트엔드 `SENTIMENT_CONFIG`의 키와 백엔드 sentiment 라벨 값이 일치하는지 확인

## When to Run

- `backend/src/services/news_analyzer.py` 수정 후 (키워드, 매핑, 감성 로직)
- `backend/src/services/news_service.py` 수정 후 (enrichment 로직)
- `backend/src/api/routes/news.py` 수정 후 (API 응답 구조)
- `frontend/src/app/news/page.tsx` 수정 후 (감성 표시, 필터 로직)
- `backend/src/tools/stock_mapper.py`의 `KEYWORD_TICKER_MAP` 수정 후 (키워드 매핑 소스)

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/services/news_analyzer.py` | NewsAnalyzer: POSITIVE/NEGATIVE_KEYWORDS, NEWS_TOPIC_MAP, 감성 분석 로직 |
| `backend/src/services/news_service.py` | NewsService: _enrich_articles()로 분석 결과 통합 |
| `backend/src/api/routes/news.py` | 뉴스 API 라우트 (GET /api/news) |
| `backend/src/tools/stock_mapper.py` | KEYWORD_TICKER_MAP (NewsAnalyzer가 import하여 사용) |
| `frontend/src/app/news/page.tsx` | 뉴스 페이지 (SENTIMENT_CONFIG, SentimentFilter 타입, 필터 UI) |

## Workflow

### Step 1: 감성 키워드 중복 검증

**파일:** `backend/src/services/news_analyzer.py`

**검사:** POSITIVE_KEYWORDS와 NEGATIVE_KEYWORDS 간 중복 키워드가 없어야 합니다. 동일 키워드가 양쪽에 있으면 감성 점수가 상쇄되어 의미없는 결과를 냅니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import ast, sys
with open('backend/src/services/news_analyzer.py', encoding='utf-8') as f:
    tree = ast.parse(f.read())
pos = neg = None
for node in ast.walk(tree):
    if isinstance(node, ast.Assign):
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id == 'POSITIVE_KEYWORDS':
                pos = {elt.value for elt in node.value.elts if isinstance(elt, ast.Constant)}
            elif isinstance(t, ast.Name) and t.id == 'NEGATIVE_KEYWORDS':
                neg = {elt.value for elt in node.value.elts if isinstance(elt, ast.Constant)}
if pos is None or neg is None:
    print('FAIL: POSITIVE_KEYWORDS or NEGATIVE_KEYWORDS not found')
    sys.exit(1)
overlap = pos & neg
if overlap:
    print(f'FAIL: Overlapping keywords: {overlap}')
    sys.exit(1)
if len(pos) == 0 or len(neg) == 0:
    print(f'FAIL: Empty keyword list (pos={len(pos)}, neg={len(neg)})')
    sys.exit(1)
print(f'PASS: {len(pos)} positive, {len(neg)} negative keywords, no overlap')
"
```

**위반:** 중복 키워드가 있으면 해당 키워드가 제목에 있을 때 pos +2, neg +2로 상쇄되어 항상 neutral로 판정됩니다.

### Step 2: NEWS_TOPIC_MAP 엔트리 구조 검증

**파일:** `backend/src/services/news_analyzer.py`

**검사:** NEWS_TOPIC_MAP의 모든 엔트리가 `ticker`, `market`, `name` 키를 갖는 dict 리스트여야 합니다. 키 누락 시 `_find_related_stocks()`에서 KeyError가 발생합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
sys.path.insert(0, 'backend')
from src.services.news_analyzer import NEWS_TOPIC_MAP
required_keys = {'ticker', 'market', 'name'}
errors = []
for topic, stocks in NEWS_TOPIC_MAP.items():
    if not isinstance(stocks, list):
        errors.append(f'{topic}: not a list')
        continue
    for i, s in enumerate(stocks):
        missing = required_keys - set(s.keys())
        if missing:
            errors.append(f'{topic}[{i}]: missing keys {missing}')
if errors:
    print(f'FAIL: {len(errors)} invalid entries:')
    for e in errors:
        print(f'  - {e}')
    sys.exit(1)
total = sum(len(v) for v in NEWS_TOPIC_MAP.values())
print(f'PASS: {len(NEWS_TOPIC_MAP)} topics, {total} stock entries, all valid')
"
```

**위반:** `ticker`, `market`, `name` 중 하나라도 누락되면 프론트엔드에서 종목 태그 표시 시 undefined가 됩니다.

### Step 3: KEYWORD_TICKER_MAP import 검증

**파일:** `backend/src/services/news_analyzer.py`

**검사:** `KEYWORD_TICKER_MAP`을 `src.tools.stock_mapper`에서 import해야 합니다. 다른 경로에서 import하거나 직접 정의하면 stock_mapper 업데이트가 반영되지 않습니다.

```bash
cd "I:\Project\AutoStock" && grep -n "from src.tools.stock_mapper import KEYWORD_TICKER_MAP" backend/src/services/news_analyzer.py
```

**PASS:** 매칭 라인이 1개 존재.

**위반:** import가 없으면 stock_mapper.py에서 종목 매핑을 추가/수정해도 뉴스 분석에 반영되지 않습니다.

### Step 4: NewsService enrichment 필드 검증

**파일:** `backend/src/services/news_service.py`

**검사:** `_enrich_articles()`에서 각 article에 `related_stocks`, `sentiment`, `sentiment_score` 3개 필드를 모두 설정해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/services/news_service.py', encoding='utf-8') as f:
    content = f.read()
required_fields = ['related_stocks', 'sentiment', 'sentiment_score']
missing = [f for f in required_fields if f'[\"{f}\"]' not in content and f\"['{f}']\" not in content]
if missing:
    print(f'FAIL: _enrich_articles missing fields: {missing}')
    sys.exit(1)
if '_enrich_articles' not in content:
    print('FAIL: _enrich_articles method not found')
    sys.exit(1)
if 'NewsAnalyzer' not in content:
    print('FAIL: NewsAnalyzer not imported/used in NewsService')
    sys.exit(1)
print(f'PASS: All {len(required_fields)} enrichment fields set via NewsAnalyzer')
"
```

**위반:** 필드가 누락되면 프론트엔드에서 감성 배지나 관련 종목 태그가 표시되지 않습니다.

### Step 5: 감성 score 범위 및 라벨 검증

**파일:** `backend/src/services/news_analyzer.py`

**검사:** `_analyze_sentiment()`에서 반환하는 sentiment_score가 -1.0 ~ 1.0 범위이고, sentiment 라벨이 `positive`, `negative`, `neutral` 중 하나여야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
sys.path.insert(0, 'backend')
from src.services.news_analyzer import NewsAnalyzer
a = NewsAnalyzer()
tests = [
    ('호재 급등 상승', '', 'positive'),
    ('악재 폭락 하락', '', 'negative'),
    ('일반 뉴스 제목', '', 'neutral'),
    ('급등과 급락', '', 'neutral'),  # 상쇄 케이스
]
errors = []
for title, summary, expected_label in tests:
    label, score = a._analyze_sentiment(title, summary)
    if score < -1.0 or score > 1.0:
        errors.append(f'score out of range: {score} for \"{title}\"')
    if label not in ('positive', 'negative', 'neutral'):
        errors.append(f'invalid label: {label} for \"{title}\"')
if errors:
    print(f'FAIL: {len(errors)} errors:')
    for e in errors:
        print(f'  - {e}')
    sys.exit(1)
print('PASS: All sentiment scores in [-1.0, 1.0], all labels valid')
"
```

**위반:** score가 범위를 벗어나면 프론트엔드에서 표시 오류가 발생하고, 잘못된 라벨은 SENTIMENT_CONFIG lookup이 실패합니다.

### Step 6: 프론트엔드-백엔드 감성 타입 동기화 검증

**파일:** `frontend/src/app/news/page.tsx`, `backend/src/services/news_analyzer.py`

**검사:** 프론트엔드 `SENTIMENT_CONFIG`의 키 셋과 백엔드에서 반환 가능한 sentiment 라벨 셋이 일치해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import re, sys
# Backend labels
with open('backend/src/services/news_analyzer.py', encoding='utf-8') as f:
    backend = f.read()
backend_labels = set(re.findall(r'sentiment\s*=\s*\"(\w+)\"', backend))

# Frontend config keys
with open('frontend/src/app/news/page.tsx', encoding='utf-8') as f:
    frontend = f.read()
frontend_keys = set(re.findall(r'(\w+):\s*\{\s*label:', frontend))

if not backend_labels:
    print('FAIL: No sentiment labels found in backend')
    sys.exit(1)
if not frontend_keys:
    print('FAIL: No SENTIMENT_CONFIG keys found in frontend')
    sys.exit(1)
missing_in_fe = backend_labels - frontend_keys
missing_in_be = frontend_keys - backend_labels
if missing_in_fe:
    print(f'FAIL: Backend labels missing in frontend SENTIMENT_CONFIG: {missing_in_fe}')
    sys.exit(1)
if missing_in_be:
    print(f'WARN: Frontend has extra keys not returned by backend: {missing_in_be}')
print(f'PASS: Frontend/Backend sentiment types synced: {backend_labels}')
"
```

**위반:** 백엔드가 새 sentiment 라벨을 추가했는데 프론트엔드 SENTIMENT_CONFIG에 없으면, 해당 뉴스의 배지가 표시되지 않거나 스타일이 없는 fallback으로 표시됩니다.

### Step 7: API 응답에 enrichment 필드 포함 확인

**파일:** `backend/src/api/routes/news.py`

**검사:** news 라우트에서 `NewsService`를 사용하고, `get_recent_news()` 또는 `collect_news()`를 통해 enrichment가 적용된 데이터를 반환해야 합니다.

```bash
cd "I:\Project\AutoStock" && python -c "
import sys
with open('backend/src/api/routes/news.py', encoding='utf-8') as f:
    content = f.read()
checks = [
    ('NewsService import', 'from src.services.news_service import NewsService' in content),
    ('news_service instance', 'NewsService()' in content),
    ('get_recent_news call', 'get_recent_news' in content),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print(f'FAIL: News route missing: {failed}')
    sys.exit(1)
print('PASS: News route uses NewsService with enrichment pipeline')
"
```

**위반:** news 라우트가 NewsService를 거치지 않으면 enrichment가 적용되지 않아 API 응답에 `related_stocks`, `sentiment`, `sentiment_score` 필드가 빠집니다.

## Output Format

```markdown
| # | 검사 항목 | 결과 | 상세 |
|---|----------|------|------|
| 1 | 감성 키워드 중복 | PASS/FAIL | pos N개, neg N개, 중복 목록 |
| 2 | NEWS_TOPIC_MAP 구조 | PASS/FAIL | N개 토픽, N개 엔트리 |
| 3 | KEYWORD_TICKER_MAP import | PASS/FAIL | import 경로 |
| 4 | NewsService enrichment 필드 | PASS/FAIL | 누락 필드 목록 |
| 5 | 감성 score 범위/라벨 | PASS/FAIL | 범위 위반, 잘못된 라벨 |
| 6 | FE-BE 감성 타입 동기화 | PASS/FAIL | 불일치 타입 목록 |
| 7 | API 응답 enrichment | PASS/FAIL | NewsService 사용 여부 |
```

## Exceptions

1. **NEWS_TOPIC_MAP에 동일 ticker 중복** — 서로 다른 토픽에 같은 ticker가 매핑되는 것은 정상 (예: "반도체"와 "HBM" 모두 SK하이닉스). `_find_related_stocks()`에서 `seen_tickers`로 중복 제거함
2. **KEYWORD_TICKER_MAP 키가 NEWS_TOPIC_MAP과 겹침** — 의도적 설계. `__init__`에서 통합 시 중복 ticker가 제거됨
3. **프론트엔드에 백엔드보다 많은 SENTIMENT_CONFIG 키** — fallback용 추가 키(예: neutral이 기본 fallback)는 위반이 아님
