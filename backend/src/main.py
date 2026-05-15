"""TradeRadar entry point.

Starts the FastAPI server with the daily scheduler.
"""

import asyncio
import logging
import sys

import uvicorn

from src.config.settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)


def main():
    """Start the TradeRadar server."""
    logger.info("Starting TradeRadar Multi-Agent Stock Analysis System")
    logger.info(f"API Server: {settings.api_host}:{settings.api_port}")
    logger.info(f"LLM Model: {settings.llm_model}")

    uvicorn.run(
        "src.api.app:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*",
        # WebSocket 인메모리 상태(active_connections, subscriptions)가 프로세스 간 공유 불가 → 단일 워커 필수.
        # 스케일 아웃 필요 시: Redis pub/sub으로 구독 상태 공유 후 멀티 워커 전환.
        workers=1,
        # 메모리 누수 방지: 5000 요청마다 워커 자동 재시작
        limit_max_requests=5000,
    )


if __name__ == "__main__":
    main()
