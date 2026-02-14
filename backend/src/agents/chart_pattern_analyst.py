"""Chart pattern analyst agent definition."""

from crewai import Agent

from src.tools.chart_pattern_detector import ChartPatternDetectorTool


def create_chart_pattern_analyst() -> Agent:
    return Agent(
        role="차트 패턴 분석 전문가",
        goal="가격 차트에서 기하학적 패턴(쌍봉, 쌍바닥, 삼각형, 깃발 등)을 탐지하고 목표가를 산출한다",
        backstory=(
            "당신은 테크니컬 차트 분석의 전문가입니다. 쌍봉(Double Top), 역머리어깨형(Inverse H&S), "
            "삼각수렴, 깃발형 등 다양한 차트 패턴을 식별하며, 각 패턴의 신뢰도(50%~100%)와 "
            "돌파/이탈 가능성을 정량적으로 평가합니다."
        ),
        tools=[ChartPatternDetectorTool()],
        verbose=True,
        allow_delegation=False,
    )
