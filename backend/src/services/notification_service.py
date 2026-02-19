"""Notification service - sends alerts via Discord/Telegram."""

from __future__ import annotations

import logging

import httpx

from src.config.settings import settings

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for sending notifications."""

    async def send_discord(self, message: str) -> bool:
        """Send message to Discord webhook."""
        if not settings.discord_webhook_url:
            logger.debug("Discord webhook not configured")
            return False
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    settings.discord_webhook_url,
                    json={"content": message},
                    timeout=10,
                )
                return resp.status_code == 204
        except Exception as e:
            logger.error(f"Discord notification failed: {e}")
            return False

    async def send_telegram(self, message: str) -> bool:
        """Send message via Telegram bot."""
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            logger.debug("Telegram bot not configured")
            return False
        try:
            url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    url,
                    json={
                        "chat_id": settings.telegram_chat_id,
                        "text": message,
                        "parse_mode": "Markdown",
                    },
                    timeout=10,
                )
                return resp.status_code == 200
        except Exception as e:
            logger.error(f"Telegram notification failed: {e}")
            return False

    async def notify_recommendations(self, recommendations: list[dict]) -> None:
        """Send recommendation notifications."""
        if not recommendations:
            return

        lines = ["## TradeRadar 투자 추천\n"]
        for rec in recommendations:
            action = rec.get("action", "HOLD")
            ticker = rec.get("ticker", "")
            name = rec.get("name", "")
            confidence = rec.get("confidence", 0)
            emoji = {"BUY": "🟢", "SELL": "🔴", "HOLD": "🟡"}.get(action, "⚪")
            lines.append(f"{emoji} **{name}** ({ticker}): {action} (신뢰도: {confidence:.0%})")

        message = "\n".join(lines)
        await self.send_discord(message)
        await self.send_telegram(message)
