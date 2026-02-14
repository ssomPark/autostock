"""Stock screener agent definition."""

from crewai import Agent

from src.tools.stock_mapper import StockMapperTool
from src.tools.korean_stock_api import KoreanStockAPITool
from src.tools.us_stock_api import USStockAPITool


def create_stock_screener() -> Agent:
    return Agent(
        role="종목 스크리닝 전문가",
        goal="추출된 키워드를 실제 주식 종목(KOSPI/KOSDAQ/NYSE/NASDAQ)으로 매핑하고 관련도가 높은 후보 종목을 선별한다",
        backstory=(
            "당신은 한국 및 미국 주식시장에 정통한 리서치 애널리스트입니다. 뉴스 키워드가 어떤 기업과 "
            "산업에 영향을 미치는지 정확히 판단할 수 있으며, 관련 종목의 기본적 분석 데이터를 바탕으로 "
            "투자 가치가 있는 후보 종목을 선별합니다."
        ),
        tools=[StockMapperTool(), KoreanStockAPITool(), USStockAPITool()],
        verbose=True,
        allow_delegation=False,
    )
