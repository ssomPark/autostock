"""Technical Analysis Crew - hierarchical process with manager.

4 analysts (candlestick, chart pattern, S/R, volume) coordinated by a manager agent.
"""

from crewai import Agent, Crew, Task, Process

from src.agents.candlestick_analyst import create_candlestick_analyst
from src.agents.chart_pattern_analyst import create_chart_pattern_analyst
from src.agents.support_resistance_analyst import create_support_resistance_analyst
from src.agents.volume_analyst import create_volume_analyst


def create_analysis_crew() -> Crew:
    candlestick = create_candlestick_analyst()
    chart_pattern = create_chart_pattern_analyst()
    sr_analyst = create_support_resistance_analyst()
    volume = create_volume_analyst()

    manager = Agent(
        role="기술적 분석 총괄 매니저",
        goal="4개 분석가(캔들스틱, 차트패턴, 지지/저항, 거래량)의 분석을 조율하고 종합 결과를 도출한다",
        backstory=(
            "당신은 기술적 분석 팀의 총괄 매니저입니다. 각 분석가의 전문성을 이해하고 "
            "분석 결과를 종합하여 일관된 기술적 분석 보고서를 작성합니다."
        ),
        verbose=True,
        allow_delegation=True,
    )

    candlestick_task = Task(
        description=(
            "후보 종목의 최근 60일 OHLCV 데이터를 분석하여 캔들스틱 패턴을 식별하세요. "
            "단일 캔들(해머, 도지, 마루보즈 등)과 복합 캔들(잉태형, 장악형, 별 등) 패턴을 모두 탐지하고, "
            "각 패턴의 신뢰도와 매매 방향(BUY/SELL)을 평가하세요."
        ),
        expected_output="JSON 형식의 캔들스틱 분석 결과",
        agent=candlestick,
    )

    chart_pattern_task = Task(
        description=(
            "후보 종목의 가격 데이터에서 차트 패턴을 탐지하세요. "
            "쌍봉/쌍바닥, 삼중천정/삼중바닥, 삼각수렴, 깃발형, 쐐기형, 머리어깨형 등을 식별하세요."
        ),
        expected_output="JSON 형식의 차트 패턴 분석 결과",
        agent=chart_pattern,
    )

    sr_task = Task(
        description=(
            "후보 종목의 가격 데이터에서 주요 지지선과 저항선을 식별하세요. "
            "2회 이상 반등한 수준을 지지/저항으로 인식하고, 지지-저항 전환 현상을 탐지하세요."
        ),
        expected_output="JSON 형식의 지지/저항 분석 결과",
        agent=sr_analyst,
    )

    volume_task = Task(
        description=(
            "후보 종목의 거래량 데이터를 분석하세요. "
            "최근 거래량 추세, 이상 거래량 탐지, OBV 분석, 가격-거래량 괴리를 확인하세요."
        ),
        expected_output="JSON 형식의 거래량 분석 결과",
        agent=volume,
    )

    return Crew(
        agents=[candlestick, chart_pattern, sr_analyst, volume],
        tasks=[candlestick_task, chart_pattern_task, sr_task, volume_task],
        manager_agent=manager,
        process=Process.hierarchical,
        verbose=True,
    )
