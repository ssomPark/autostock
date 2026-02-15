"""Pipeline progress tracker with SSE support."""

from __future__ import annotations

import asyncio
import time
import uuid
import logging
from typing import Any, AsyncGenerator

logger = logging.getLogger(__name__)

PIPELINE_STEPS = [
    {"id": "news", "name": "뉴스 수집", "icon": "📰"},
    {"id": "keywords", "name": "키워드 추출", "icon": "🔑"},
    {"id": "screening", "name": "종목 스크리닝", "icon": "🔍"},
    {"id": "analysis", "name": "기술적 분석", "icon": "📊"},
    {"id": "recommendation", "name": "투자 추천 생성", "icon": "💡"},
    {"id": "save", "name": "저장 및 알림", "icon": "💾"},
]


class PipelineTracker:
    """In-memory pipeline state tracker with SSE event broadcasting."""

    def __init__(self) -> None:
        self._state: dict[str, Any] = self._idle_state()
        self._subscribers: list[asyncio.Queue] = []
        self._lock = asyncio.Lock()

    def _idle_state(self) -> dict[str, Any]:
        return {
            "pipeline_id": None,
            "market": None,
            "status": "idle",
            "current_step": None,
            "started_at": None,
            "elapsed_seconds": 0,
            "steps": [
                {
                    "id": s["id"],
                    "name": s["name"],
                    "icon": s["icon"],
                    "status": "pending",
                    "duration": None,
                    "summary": None,
                }
                for s in PIPELINE_STEPS
            ],
            "logs": [],
        }

    def _elapsed(self) -> float:
        if self._state["started_at"] is None:
            return 0
        return round(time.time() - self._state["started_at"], 1)

    async def _broadcast(self) -> None:
        self._state["elapsed_seconds"] = self._elapsed()
        snapshot = self.get_state()
        dead: list[asyncio.Queue] = []
        for q in self._subscribers:
            try:
                q.put_nowait(snapshot)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._subscribers.remove(q)

    def _find_step(self, step_id: str) -> dict | None:
        for s in self._state["steps"]:
            if s["id"] == step_id:
                return s
        return None

    # --- Public API (called from pipeline flow) ---

    async def start(self, market: str) -> str:
        async with self._lock:
            pid = str(uuid.uuid4())[:8]
            self._state = self._idle_state()
            self._state["pipeline_id"] = pid
            self._state["market"] = market
            self._state["status"] = "running"
            self._state["started_at"] = time.time()
            self._state["logs"] = [self._log_entry(f"파이프라인 시작 (시장: {market})")]
            await self._broadcast()
            return pid

    async def step_start(self, step_id: str) -> None:
        async with self._lock:
            step = self._find_step(step_id)
            if step:
                step["status"] = "running"
                step["_start_time"] = time.time()
                self._state["current_step"] = step_id
                self._state["logs"].append(
                    self._log_entry(f"{step['icon']} {step['name']} 시작...")
                )
                await self._broadcast()

    async def step_done(self, step_id: str, summary: str = "") -> None:
        async with self._lock:
            step = self._find_step(step_id)
            if step:
                start_time = step.pop("_start_time", time.time())
                step["status"] = "completed"
                step["duration"] = round(time.time() - start_time, 1)
                step["summary"] = summary
                self._state["logs"].append(
                    self._log_entry(
                        f"✅ {step['name']} 완료 ({step['duration']}s) - {summary}"
                    )
                )
                await self._broadcast()

    async def log(self, message: str) -> None:
        async with self._lock:
            self._state["logs"].append(self._log_entry(message))
            await self._broadcast()

    async def fail(self, step_id: str, error: str) -> None:
        async with self._lock:
            step = self._find_step(step_id)
            if step:
                start_time = step.pop("_start_time", time.time())
                step["status"] = "failed"
                step["duration"] = round(time.time() - start_time, 1)
                step["summary"] = f"오류: {error}"
            self._state["status"] = "failed"
            self._state["logs"].append(self._log_entry(f"❌ 실패: {error}"))
            await self._broadcast()

    async def complete(self, summary: str = "") -> None:
        async with self._lock:
            self._state["status"] = "completed"
            self._state["current_step"] = None
            self._state["logs"].append(
                self._log_entry(f"🎉 파이프라인 완료! {summary}")
            )
            await self._broadcast()

    def get_state(self) -> dict[str, Any]:
        state = {**self._state}
        state["elapsed_seconds"] = self._elapsed()
        steps = []
        for s in state["steps"]:
            steps.append({k: v for k, v in s.items() if not k.startswith("_")})
        state["steps"] = steps
        return state

    async def subscribe(self) -> AsyncGenerator[dict, None]:
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._subscribers.append(q)
        try:
            yield self.get_state()
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30)
                    yield event
                except asyncio.TimeoutError:
                    yield {"keepalive": True}
        finally:
            if q in self._subscribers:
                self._subscribers.remove(q)

    @staticmethod
    def _log_entry(message: str) -> str:
        ts = time.strftime("%H:%M:%S")
        return f"[{ts}] {message}"


# Global singleton
tracker = PipelineTracker()
