import { test, expect } from "@playwright/test";

test.describe("대시보드", () => {
  test("메인 페이지 로딩", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/TradeRadar/i);
    await expect(page.locator("main")).toBeVisible();
  });

  test("사이드바 네비게이션 표시", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("nav, aside").first();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("종목 분석")).toBeVisible();
    await expect(sidebar.getByText("투자 추천")).toBeVisible();
    await expect(sidebar.getByText("뉴스")).toBeVisible();
  });

  test("대시보드 위젯 렌더링", async ({ page }) => {
    await page.goto("/");
    // 대시보드에 콘텐츠가 로드되는지 확인
    await page.waitForLoadState("networkidle");
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });
});
