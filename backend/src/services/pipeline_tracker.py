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
            "steps": self._fresh_steps(),
            "logs": [],
            "batch": {
                "enabled": False,
                "markets": [],
                "current_index": 0,
                "results": [],
            },
        }

    @staticmethod
    def _fresh_steps() -> list[dict[str, Any]]:
        return [
            {
                "id": s["id"],
                "name": s["name"],
                "icon": s["icon"],
                "status": "pending",
                "duration": None,
                "summary": None,
            }
            for s in PIPELINE_STEPS
        ]

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

    async def start(self, market: str, batch_markets: list[str] | None = None) -> str:
        async with self._lock:
            pid = str(uuid.uuid4())[:8]
            self._state = self._idle_state()
            self._state["pipeline_id"] = pid
            self._state["market"] = market
            self._state["status"] = "running"
            self._state["started_at"] = time.time()

            if batch_markets:
                self._state["batch"] = {
                    "enabled": True,
                    "markets": batch_markets,
                    "current_index": 0,
                    "results": [],
                }
                self._state["logs"] = [
                    self._log_entry(f"배치 파이프라인 시작 ({' → '.join(batch_markets)})"),
                    self._log_entry(f"파이프라인 시작 (시장: {market})"),
                ]
            else:
                self._state["logs"] = [self._log_entry(f"파이프라인 시작 (시장: {market})")]

            await self._broadcast()
            return pid

    async def step_start(self, step_id: str) -> None:
        async with self._lock:
            # 이전 running step이 있으면 자동 완료 처리
            for s in self._state["steps"]:
                if s["id"] != step_id and s["status"] == "running":
                    start_time = s.pop("_start_time", time.time())
                    s["status"] = "completed"
                    s["duration"] = round(time.time() - start_time, 1)
                    if not s.get("summary"):
                        s["summary"] = "자동 완료"
                    self._state["logs"].append(
                        self._log_entry(
                            f"✅ {s['name']} 완료 ({s['duration']}s) - {s['summary']}"
                        )
                    )

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
            # 아직 running 상태인 step이 있으면 자동 완료 처리
            for s in self._state["steps"]:
                if s["status"] == "running":
                    start_time = s.pop("_start_time", time.time())
                    s["status"] = "completed"
                    s["duration"] = round(time.time() - start_time, 1)
                    if not s.get("summary"):
                        s["summary"] = "자동 완료"
                    self._state["logs"].append(
                        self._log_entry(
                            f"✅ {s['name']} 완료 ({s['duration']}s) - {s['summary']}"
                        )
                    )

            batch = self._state["batch"]
            if batch["enabled"]:
                # 배치 모드: 현재 마켓 완료만 기록 (최종 완료는 advance_batch에서 처리)
                self._state["current_step"] = None
                self._state["logs"].append(
                    self._log_entry(f"✅ {self._state['market']} 시장 파이프라인 완료! {summary}")
                )
                await self._broadcast()
            else:
                self._state["status"] = "completed"
                self._state["current_step"] = None
                self._state["logs"].append(
                    self._log_entry(f"🎉 파이프라인 완료! {summary}")
                )
                await self._broadcast()

    async def advance_batch(self) -> str | None:
        """배치 모드에서 다음 마켓으로 진행. 다음 마켓 문자열 반환, 없으면 None."""
        async with self._lock:
            batch = self._state["batch"]
            if not batch["enabled"]:
                return None

            # 현재 마켓 결과 저장
            current_market = batch["markets"][batch["current_index"]]
            completed_steps = [s for s in self._state["steps"] if s.get("status") == "completed"]
            duration = sum(s.get("duration", 0) or 0 for s in completed_steps)
            batch["results"].append({
                "market": current_market,
                "status": "completed",
                "duration": round(duration, 1),
            })

            next_index = batch["current_index"] + 1
            if next_index < len(batch["markets"]):
                # 다음 마켓으로 진행
                next_market = batch["markets"][next_index]
                batch["current_index"] = next_index
                self._state["market"] = next_market
                self._state["steps"] = self._fresh_steps()
                self._state["current_step"] = None
                self._state["logs"].append(
                    self._log_entry(f"--- 다음 시장으로 전환: {next_market} ---")
                )
                self._state["logs"].append(
                    self._log_entry(f"파이프라인 시작 (시장: {next_market})")
                )
                await self._broadcast()
                return next_market
            else:
                # 모든 마켓 완료
                total_duration = sum(r["duration"] for r in batch["results"])
                market_summary = " + ".join(
                    f"{r['market']} {r['duration']}s" for r in batch["results"]
                )
                self._state["status"] = "completed"
                self._state["logs"].append(
                    self._log_entry(
                        f"🎉 전체 파이프라인 완료 — {market_summary} = 총 {round(total_duration, 1)}s"
                    )
                )
                await self._broadcast()
                return None

    async def reset(self) -> None:
        """강제 리셋 — 상태를 idle로 초기화."""
        async with self._lock:
            old_status = self._state["status"]
            self._state = self._idle_state()
            self._state["logs"] = [
                self._log_entry(f"파이프라인 수동 리셋 (이전 상태: {old_status})")
            ]
            await self._broadcast()

    def get_state(self) -> dict[str, Any]:
        state = {**self._state}
        state["elapsed_seconds"] = self._elapsed()

        # 자동 타임아웃: 15분(900초) 초과 시 timeout 처리
        if state["status"] == "running" and state["elapsed_seconds"] > 900:
            state["status"] = "timeout"

        steps = []
        for s in state["steps"]:
            steps.append({k: v for k, v in s.items() if not k.startswith("_")})
        state["steps"] = steps
        state["batch"] = {**self._state["batch"]}
        return state

    async def subscribe(self) -> AsyncGenerator[dict, None]:
        q: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._subscribers.append(q)
        try:
            yield self.get_state()
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15)
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
