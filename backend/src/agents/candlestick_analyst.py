"""Candlestick analyst agent definition."""

from crewai import Agent

from src.tools.candlestick_detector import CandlestickDetectorTool


def create_candlestick_analyst() -> Agent:
    return Agent(
        role="캔들스틱 패턴 분석 전문가",
        goal="OHLCV 데이터에서 단일/복합 캔들스틱 패턴을 식별하고 매매 신호를 생성한다",
        backstory=(
            "당신은 일본 캔들스틱 차트 분석의 대가입니다. 해머, 도지, 잉태형, 장악형 등 수십 가지 "
            "캔들스틱 패턴을 정확하게 식별하며, 각 패턴의 신뢰도와 시장 맥락을 고려한 매매 신호를 "
            "생성합니다. 신뢰도 기반 의사결정에 능숙합니다."
        ),
        tools=[CandlestickDetectorTool()],
        verbose=True,
        allow_delegation=False,
    )
