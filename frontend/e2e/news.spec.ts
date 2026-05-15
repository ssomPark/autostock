import { test, expect } from "@playwright/test";

test.describe("뉴스", () => {
  test("뉴스 피드 로딩", async ({ page }) => {
    await page.goto("/news");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible();
  });

  test("뉴스 목록 렌더링", async ({ page }) => {
    await page.goto("/news");
    await page.waitForLoadState("networkidle");
    // 뉴스 아이템이 있거나 빈 상태 메시지가 있음
    const main = page.locator("main");
    await expect(main).toBeVisible();
    const textContent = await main.textContent();
    // 뉴스 콘텐츠 또는 "뉴스가 없습니다" 메시지 확인
    expect(textContent?.length).toBeGreaterThan(0);
  });
});
