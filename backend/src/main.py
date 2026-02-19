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
    )


if __name__ == "__main__":
    main()
