"""Support/resistance analyst agent definition."""

from crewai import Agent

from src.tools.support_resistance import SupportResistanceTool


def create_support_resistance_analyst() -> Agent:
    return Agent(
        role="지지/저항선 분석 전문가",
        goal="가격 데이터에서 핵심 지지선과 저항선을 식별하고 돌파/반등 가능성을 평가한다",
        backstory=(
            "당신은 수평선(지지/저항) 분석의 전문가입니다. 2회 이상 반등하는 가격 수준을 정확히 "
            "식별하며, 지지-저항 전환(역할 전환) 현상을 포착합니다. 현재 가격 대비 주요 수준과의 "
            "거리를 분석하여 매수/매도 타이밍을 제시합니다."
        ),
        tools=[SupportResistanceTool()],
        verbose=True,
        allow_delegation=False,
    )
