"""Volume analyst agent definition."""

from crewai import Agent

from src.tools.volume_analyzer import VolumeAnalyzerTool


def create_volume_analyst() -> Agent:
    return Agent(
        role="거래량 분석 전문가",
        goal="거래량 패턴을 분석하여 가격 움직임의 신뢰도를 검증하고 이상 거래를 탐지한다",
        backstory=(
            "당신은 거래량 분석의 전문가입니다. 거래량은 가격 움직임의 연료라는 원칙을 철저히 따르며, "
            "거래량 급증, OBV(On-Balance Volume), VWAP 등을 활용하여 추세의 강도와 지속 가능성을 "
            "평가합니다. 스마트 머니의 움직임을 거래량에서 포착합니다."
        ),
        tools=[VolumeAnalyzerTool()],
        verbose=True,
        allow_delegation=False,
    )
