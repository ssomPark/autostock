"""News collector agent definition."""

from crewai import Agent

from src.tools.news_scraper import NewsCrawlerTool, NaverFinanceScraperTool


def create_news_collector() -> Agent:
    return Agent(
        role="경제/테크 뉴스 수집 전문가",
        goal="한국 주요 경제 매체(매일경제, 한경, 네이버 금융)에서 최신 경제/테크 뉴스를 수집하고 중요도를 평가한다",
        backstory=(
            "당신은 10년 이상 경력의 금융 뉴스 전문 기자입니다. 한국 경제 시장의 흐름을 꿰뚫고 있으며, "
            "매일경제, 한국경제, 네이버 금융 등의 주요 매체에서 투자에 영향을 줄 수 있는 핵심 뉴스를 "
            "빠르게 포착하는 능력을 가지고 있습니다."
        ),
        tools=[NewsCrawlerTool(), NaverFinanceScraperTool()],
        verbose=True,
        allow_delegation=False,
    )
