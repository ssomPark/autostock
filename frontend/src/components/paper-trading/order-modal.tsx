"use client";

import { useState } from "react";
import { executePaperBuy } from "@/lib/api";

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accountId: number;
  ticker: string;
  name: string;
  market: string;
  price: number;
  source?: string;
  recommendationId?: number;
  recommendationAction?: string;
  recommendationConfidence?: number;
  recommendationGrade?: string;
}

export function OrderModal({
  isOpen,
  onClose,
  onSuccess,
  accountId,
  ticker,
  name,
  market,
  price,
  source = "manual",
  recommendationId,
  recommendationAction,
  recommendationConfidence,
  recommendationGrade,
}: OrderModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalCost = quantity * price;

  const handleSubmit = async () => {
    if (quantity <= 0) {
      setError("수량은 1 이상이어야 합니다.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await executePaperBuy({
        account_id: accountId,
        ticker,
        name,
        market,
        quantity,
        price,
        source,
        recommendation_id: recommendationId,
        recommendation_action: recommendationAction,
        recommendation_confidence: recommendationConfidence,
        recommendation_grade: recommendationGrade,
      });
      onSuccess();
      onClose();
      setQuantity(1);
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("400")) {
        setError("잔고가 부족합니다.");
      } else if (msg.includes("401")) {
        setError("로그인이 필요합니다.");
      } else {
        setError("주문 실행에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">모의 매수</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Stock info */}
          <div className="bg-white/5 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{name}</span>
                <span className="text-[var(--muted)] text-sm ml-1">({ticker})</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-blue-600/20 text-blue-400">{market}</span>
            </div>
            <div className="text-xl font-bold mt-1">{price.toLocaleString()}원</div>
          </div>

          {/* Quantity input */}
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1">수량</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center text-lg"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 h-10 rounded-lg bg-white/5 border border-[var(--card-border)] px-3 text-center text-lg font-medium focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center text-lg"
              >
                +
              </button>
            </div>
            {/* Quick quantity buttons */}
            <div className="flex gap-2 mt-2">
              {[1, 5, 10, 50, 100].map((q) => (
                <button
                  key={q}
                  onClick={() => setQuantity(q)}
                  className={`flex-1 py-1 rounded text-xs transition-colors ${
                    quantity === q
                      ? "bg-blue-600 text-white"
                      : "bg-white/5 text-[var(--muted)] hover:bg-white/10"
                  }`}
                >
                  {q}주
                </button>
              ))}
            </div>
          </div>

          {/* Total amount */}
          <div className="bg-white/5 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)] text-sm">총 매수 금액</span>
              <span className="text-lg font-bold">{totalCost.toLocaleString()}원</span>
            </div>
          </div>

          {/* Source badge */}
          {source === "recommendation" && (
            <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
              <span className="px-2 py-0.5 rounded bg-green-600/20 text-green-400">추천 기반</span>
              {recommendationAction && (
                <span>{recommendationAction}</span>
              )}
              {recommendationConfidence != null && (
                <span>신뢰도 {(recommendationConfidence * 100).toFixed(0)}%</span>
              )}
              {recommendationGrade && (
                <span>등급 {recommendationGrade}</span>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {loading ? "주문 실행 중..." : `${quantity}주 매수 (${totalCost.toLocaleString()}원)`}
          </button>
        </div>
      </div>
    </div>
  );
}
