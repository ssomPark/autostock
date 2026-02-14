"""News Intelligence Crew - collects news and extracts keywords."""

from crewai import Agent, Crew, Task

from src.agents.news_collector import create_news_collector
from src.agents.keyword_extractor import create_keyword_extractor


def create_news_crew() -> Crew:
    collector = create_news_collector()
    extractor = create_keyword_extractor()

    collect_task = Task(
        description=(
            "한국 주요 경제 매체(매일경제, 한국경제, 네이버 금융)에서 오늘의 경제/테크 관련 뉴스를 수집하세요. "
            "최소 20개 이상의 기사를 수집하고, 각 기사의 제목, 본문 요약, URL, 게시 시간을 포함하세요. "
            "투자에 직접 영향을 줄 수 있는 기사를 우선적으로 선별하세요."
        ),
        expected_output=(
            "JSON 형식의 뉴스 기사 목록. 각 기사는 title, summary, url, source, "
            "published_at, relevance_score 필드를 포함."
        ),
        agent=collector,
    )

    extract_task = Task(
        description=(
            "수집된 뉴스 기사들에서 투자 관련 키워드를 추출하세요. "
            "기업명, 산업 키워드, 경제 지표, 정책 관련 단어를 추출하고, "
            "각 키워드의 빈도, 중요도, 감성(긍정/부정/중립)을 평가하세요."
        ),
        expected_output=(
            "JSON 형식의 키워드 목록. 각 키워드는 keyword, frequency, importance_score, "
            "sentiment, related_articles 필드를 포함."
        ),
        agent=extractor,
        context=[collect_task],
    )

    return Crew(
        agents=[collector, extractor],
        tasks=[collect_task, extract_task],
        verbose=True,
    )
