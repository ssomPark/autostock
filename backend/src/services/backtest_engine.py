"""Backtesting engine using ScoringEngine signals."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from src.analysis.scoring_engine import ScoringEngine

logger = logging.getLogger(__name__)


@dataclass
class Trade:
    entry_date: str
    entry_price: float
    exit_date: str | None = None
    exit_price: float | None = None
    shares: int = 0
    reason: str = ""
    pnl: float = 0.0
    pnl_pct: float = 0.0

    def to_dict(self) -> dict:
        return {
            "entry_date": self.entry_date,
            "entry_price": self.entry_price,
            "exit_date": self.exit_date,
            "exit_price": self.exit_price,
            "shares": self.shares,
            "reason": self.reason,
            "pnl": self.pnl,
            "pnl_pct": self.pnl_pct,
        }


@dataclass
class BacktestResult:
    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[dict] = field(default_factory=list)
    daily_signals: list[dict] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "trades": [t.to_dict() for t in self.trades],
            "equity_curve": self.equity_curve,
            "daily_signals": self.daily_signals,
            "metrics": self.metrics,
        }


class BacktestEngine:
    """ScoringEngine 기반 백테스팅 엔진.

    단일 포지션, 전액 투입, 종가 기준 매매.
    """

    MIN_LOOKBACK = 60

    def __init__(
        self,
        initial_capital: float = 10_000_000,
        commission_rate: float = 0.00015,
    ):
        self.initial_capital = initial_capital
        self.commission_rate = commission_rate

    def run(self, df: pd.DataFrame, start_idx: int | None = None) -> BacktestResult:
        """Run backtest on OHLCV DataFrame.

        Args:
            df: Full OHLCV data (including lookback period before trading start).
            start_idx: Index where actual trading begins. Defaults to MIN_LOOKBACK.
        """
        result = BacktestResult()

        if start_idx is None:
            start_idx = self.MIN_LOOKBACK

        if len(df) <= start_idx:
            logger.warning("Not enough data for backtest")
            return result

        # Normalize column names
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]

        cash = self.initial_capital
        position: Trade | None = None
        shares = 0
        target_price = 0.0
        stop_loss_price = 0.0

        for i in range(start_idx, len(df)):
            idx = df.index[i]
            current_date = str(idx.date()) if hasattr(idx, "date") else str(idx)
            close = float(df.iloc[i]["close"])

            # Trailing window for ScoringEngine
            window_start = max(0, i - self.MIN_LOOKBACK)
            trailing_df = df.iloc[window_start : i + 1].copy()

            # Run ScoringEngine (no fundamentals)
            signal = "HOLD"
            grade = "N/A"
            score_result = None
            try:
                engine = ScoringEngine(trailing_df)
                score_result = engine.compute()
                signal = score_result["signal"]
                grade = score_result.get("grade", "N/A")
            except Exception as e:
                logger.debug(f"ScoringEngine error at {current_date}: {e}")

            result.daily_signals.append({
                "date": current_date,
                "signal": signal,
                "grade": grade,
            })

            # --- Trading logic ---
            if position is None:
                if signal == "BUY":
                    shares = int(cash / (close * (1 + self.commission_rate)))
                    if shares > 0:
                        cost = shares * close * (1 + self.commission_rate)
                        cash -= cost
                        target_price = float(
                            score_result.get("target", {}).get("consensus", close * 1.1)
                        ) if score_result else close * 1.1
                        stop_loss_price = float(
                            score_result.get("stop_loss", {}).get("final", close * 0.95)
                        ) if score_result else close * 0.95
                        position = Trade(
                            entry_date=current_date,
                            entry_price=close,
                            shares=shares,
                        )
            else:
                sell_reason = None

                if close >= target_price:
                    sell_reason = "익절"
                elif close <= stop_loss_price:
                    sell_reason = "손절"
                elif signal == "SELL":
                    sell_reason = "신호전환"

                if sell_reason:
                    proceeds = shares * close * (1 - self.commission_rate)
                    cash += proceeds

                    pnl = (close - position.entry_price) * shares
                    pnl_pct = (close / position.entry_price - 1) * 100

                    position.exit_date = current_date
                    position.exit_price = close
                    position.reason = sell_reason
                    position.pnl = round(pnl, 0)
                    position.pnl_pct = round(pnl_pct, 2)

                    result.trades.append(position)
                    position = None
                    shares = 0

            # Record equity
            equity = cash + (shares * close if position else 0)
            result.equity_curve.append({
                "date": current_date,
                "equity": round(equity, 0),
            })

        # Close open position at end
        if position:
            last_close = float(df.iloc[-1]["close"])
            proceeds = shares * last_close * (1 - self.commission_rate)
            cash += proceeds

            pnl = (last_close - position.entry_price) * shares
            pnl_pct = (last_close / position.entry_price - 1) * 100

            last_idx = df.index[-1]
            position.exit_date = str(last_idx.date()) if hasattr(last_idx, "date") else str(last_idx)
            position.exit_price = last_close
            position.reason = "기간종료"
            position.pnl = round(pnl, 0)
            position.pnl_pct = round(pnl_pct, 2)
            result.trades.append(position)

        result.metrics = self._calculate_metrics(result)
        return result

    def _calculate_metrics(self, result: BacktestResult) -> dict:
        """Calculate performance metrics."""
        if not result.equity_curve:
            return {}

        equities = [e["equity"] for e in result.equity_curve]
        final_equity = equities[-1]

        total_return_pct = (final_equity / self.initial_capital - 1) * 100

        # Max drawdown
        peak = equities[0]
        max_dd = 0.0
        for eq in equities:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak * 100
            if dd > max_dd:
                max_dd = dd

        # Sharpe ratio (annualized)
        sharpe = 0.0
        if len(equities) > 1:
            returns = []
            for j in range(1, len(equities)):
                if equities[j - 1] > 0:
                    returns.append(equities[j] / equities[j - 1] - 1)
            if returns:
                std = float(np.std(returns))
                if std > 0:
                    sharpe = float(np.mean(returns)) / std * math.sqrt(252)

        # Trade statistics
        trades = result.trades
        winning = [t for t in trades if t.pnl > 0]
        losing = [t for t in trades if t.pnl <= 0]

        win_rate = len(winning) / len(trades) * 100 if trades else 0
        avg_pnl_pct = sum(t.pnl_pct for t in trades) / len(trades) if trades else 0
        max_win_pct = max((t.pnl_pct for t in trades), default=0)
        max_loss_pct = min((t.pnl_pct for t in trades), default=0)

        gross_profit = sum(t.pnl for t in winning) if winning else 0
        gross_loss = abs(sum(t.pnl for t in losing)) if losing else 0
        if gross_loss > 0:
            profit_factor = gross_profit / gross_loss
        elif gross_profit > 0:
            profit_factor = 999.99
        else:
            profit_factor = 0.0

        return {
            "initial_capital": self.initial_capital,
            "final_equity": round(final_equity, 0),
            "total_return_pct": round(total_return_pct, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "sharpe_ratio": round(float(sharpe), 2),
            "total_trades": len(trades),
            "win_rate": round(win_rate, 1),
            "avg_pnl_pct": round(avg_pnl_pct, 2),
            "max_win_pct": round(max_win_pct, 2),
            "max_loss_pct": round(max_loss_pct, 2),
            "profit_factor": round(profit_factor, 2),
            "winning_trades": len(winning),
            "losing_trades": len(losing),
        }
