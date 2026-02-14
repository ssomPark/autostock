"""Stock Screening Crew - maps keywords to stock tickers."""

from crewai import Crew, Task

from src.agents.stock_screener import create_stock_screener


def create_screening_crew() -> Crew:
    screener = create_stock_screener()

    screen_task = Task(
        description=(
            "추출된 키워드를 바탕으로 관련 종목을 스크리닝하세요. "
            "한국(KOSPI/KOSDAQ) 및 미국(NYSE/NASDAQ) 시장에서 관련 종목을 매핑하고, "
            "각 종목의 기본 정보(현재가, 시가총액, PER 등)를 조회하세요. "
            "최종적으로 10~20개의 후보 종목을 선별하세요."
        ),
        expected_output=(
            "JSON 형식의 후보 종목 목록. 각 종목은 ticker, name, market, "
            "current_price, market_cap, relevance_score, related_keywords 필드를 포함."
        ),
        agent=screener,
    )

    return Crew(
        agents=[screener],
        tasks=[screen_task],
        verbose=True,
    )
