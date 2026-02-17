# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

모든 응답은 한국어로 작성할 것.

## Commands

### Backend (Python)
```bash
cd backend && pip install -e .        # 의존성 설치 (pyproject.toml 기반)
cd backend && python -m src.main      # FastAPI 서버 시작 (port 8000, reload=False 필수)
```

### Frontend (Next.js)
```bash
cd frontend && npm install            # 의존성 설치
cd frontend && npm run dev            # 개발 서버 (port 3000)
cd frontend && npm run build          # 프로덕션 빌드
cd frontend && npm run lint           # ESLint
```

### Docker (전체 스택)
```bash
docker-compose up                     # 전체 서비스 (backend + postgres + redis)
docker-compose up postgres redis      # DB만 실행
```

## Architecture

### 전체 구조
N8N 오케스트레이터가 파이프라인을 제어하고, Backend는 순수 분석 API를 제공하며, Frontend는 결과를 시각화한다.

```
N8N (port 8626)  →  Backend API (port 8000)  →  PostgreSQL + Redis
                                                      ↑
Frontend (port 3000)  ─────────────────────────────────┘
```

**파이프라인 흐름**: 뉴스 수집 → 키워드 추출(LLM) → 종목 스크리닝 → 기술적 분석 → 매매 추천

### Backend (`backend/src/`)
- **`api/routes/`**: FastAPI 라우트. 핵심은 `analysis.py`(기술적 분석)와 `n8n.py`(파이프라인 연동 6개 엔드포인트)
- **`analysis/`**: LLM 독립적인 순수 Python 분석 로직
  - `scoring_engine.py`: 종합 점수 산출 (ATR, RSI, EMA, Fibonacci, 등급 A+~F)
  - `signal_aggregator.py`: 가중 신호 합산 → BUY/SELL/HOLD 결정
  - `candlestick_patterns.py`, `chart_patterns.py`, `support_resistance.py`, `volume_analysis.py`
- **`tools/`**: 외부 데이터 수집 (KIS API=한국주식, yfinance=미국주식, 네이버 뉴스)
- **`models/`**: `db_models.py`(SQLAlchemy ORM 7개 모델), `schemas.py`(Pydantic 27개 스키마)
- **`services/`**: 비즈니스 로직 (market_screener, news_service 등)

### Frontend (`frontend/src/`)
- **`app/`**: Next.js 15 App Router 페이지들 (`/`, `/recommendations`, `/analysis/[ticker]`, `/search`, `/news`, `/pipeline`)
- **`components/`**: dashboard 위젯들 + charts (TradingView lightweight-charts)
- **`lib/api.ts`**: Backend API 클라이언트
- **`lib/query-provider.tsx`**: TanStack React Query 설정

### Signal Weights (신호 가중치)
```
News: 20% | Candlestick: 20% | ChartPattern: 25% | S/R: 20% | Volume: 15%
```

## API Routes

| 경로 | 설명 |
|------|------|
| `GET /api/analysis/{ticker}` | 전체 기술적 분석 |
| `GET /api/analysis/{ticker}/score` | 종합 점수 + 등급 |
| `GET /api/analysis/{ticker}/ohlcv` | OHLCV 캔들 데이터 |
| `GET /api/recommendations` | 추천 목록 (필터: market, action) |
| `GET /api/recommendations/summary/dashboard` | 대시보드 요약 |
| `POST /api/n8n/*` | N8N 파이프라인 연동 (start/progress/complete/stock-mapping/market-screener/aggregate/save-recommendations) |
| `GET /api/pipeline/stream` | SSE 실시간 스트리밍 |

## Known Pitfalls

- **`uvicorn reload=True` 금지**: CrewAI config 파일 쓰기가 무한 재시작을 유발함
- **numpy 직렬화**: FastAPI 응답에 numpy 타입이 들어가면 직렬화 오류 → `_sanitize()` 헬퍼로 native Python 변환 필수
- **Tool wrapper**: `str()` 대신 `json.dumps()` 사용 필수
- **DB 없이 실행 가능**: `init_db()` try/except 처리됨. PostgreSQL 없어도 분석 API는 동작
- **TA-Lib 미사용**: `ta` 패키지 사용 (설치 간편). TA-Lib import 하지 말 것
- **N8N 네트워크**: Docker에서 `n8n_live_n8n_live_network`로 backend ↔ n8n_live 통신

## Skills

| 스킬 | 설명 |
|------|------|
| `verify-analysis` | Backend 분석 모듈 핵심 규칙 검증 (신호 가중치, numpy 직렬화, ScoringEngine 계약, 신뢰도 범위) |
| `verify-auth` | OAuth 인증, JWT, DB 모델 제약, Route 인증 패턴, CORS 설정, Frontend 토큰 관리 검증 |
| `verify-news` | 뉴스 분석 모듈 핵심 규칙 검증 (감성 키워드 일관성, NEWS_TOPIC_MAP 구조, API 응답 필드, FE-BE 감성 타입 동기화) |
| `verify-paper-trading` | 모의 투자 잔고 일관성, 매수/매도 로직, 가격 fallback, DB 모델 제약, FE-BE API 동기화 검증 |

## Environment Variables

`backend/.env.example` 참조. 핵심:
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`: LLM
- `DATABASE_URL`: `postgresql+asyncpg://autostock:autostock@localhost:5432/autostock`
- `KIS_APP_KEY` / `KIS_APP_SECRET`: 한국투자증권 API
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`: 네이버 뉴스 API
- `N8N_WEBHOOK_URL`: N8N 파이프라인 트리거
