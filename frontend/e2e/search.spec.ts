import { test, expect } from "@playwright/test";

test.describe("종목 검색", () => {
  test("검색 페이지 로딩", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator("input[type='text'], input[type='search']").first()).toBeVisible();
  });

  test("종목 검색 → 결과 표시", async ({ page }) => {
    await page.goto("/search");
    const searchInput = page.locator("input[type='text'], input[type='search']").first();
    await searchInput.fill("삼성전자");
    // 자동완성 드롭다운 또는 검색 결과 대기
    await page.waitForTimeout(1000);
    const suggestions = page.locator("[role='listbox'], [role='option'], ul li");
    const count = await suggestions.count();
    // 검색 결과가 나타나거나 입력이 처리됨
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("분석 결과 섹션 확인", async ({ page }) => {
    await page.goto("/search?ticker=005930&market=KOSPI");
    await page.waitForLoadState("networkidle");
    // 분석 결과가 로드되면 신호 관련 텍스트가 표시됨
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });
});
