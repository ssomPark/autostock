"""Recommendation Crew - generates final BUY/SELL/HOLD recommendations."""

from crewai import Crew, Task

from src.agents.recommendation_agent import create_recommendation_agent


def create_recommendation_crew() -> Crew:
    strategist = create_recommendation_agent()

    recommend_task = Task(
        description=(
            "모든 기술적 분석 결과(캔들스틱, 차트패턴, 지지/저항, 거래량)와 뉴스 감성을 종합하여 "
            "각 종목에 대한 최종 투자 추천을 생성하세요. "
            "가중치: 뉴스(20%) + 캔들(20%) + 차트패턴(25%) + 지지저항(20%) + 거래량(15%). "
            "BUY/SELL/HOLD 판정과 함께 신뢰도, 목표가, 손절가를 제시하세요."
        ),
        expected_output=(
            "JSON 형식의 최종 추천 목록. 각 종목별 action(BUY/SELL/HOLD), confidence, "
            "target_price, stop_loss, reasoning, component_signals 필드를 포함."
        ),
        agent=strategist,
    )

    return Crew(
        agents=[strategist],
        tasks=[recommend_task],
        verbose=True,
    )
