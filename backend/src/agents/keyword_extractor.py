"""Keyword extractor agent definition."""

from crewai import Agent


def create_keyword_extractor() -> Agent:
    return Agent(
        role="주식 키워드/감성 분석 전문가",
        goal="뉴스 기사에서 투자 관련 키워드를 추출하고 시장 감성(긍정/부정/중립)을 분석한다",
        backstory=(
            "당신은 자연어 처리(NLP) 전문가이자 금융 분석가입니다. 한국어 텍스트에서 기업명, "
            "산업 키워드, 경제 지표를 정확하게 추출하며, 기사의 논조를 파악하여 시장 감성을 "
            "정량화합니다. 특히 한국 시장 특유의 표현과 맥락을 이해하는 데 탁월합니다."
        ),
        verbose=True,
        allow_delegation=False,
    )
