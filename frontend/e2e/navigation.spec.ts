import { test, expect } from "@playwright/test";

const publicPages = [
  { path: "/", name: "대시보드" },
  { path: "/search", name: "종목 분석" },
  { path: "/recommendations", name: "투자 추천" },
  { path: "/news", name: "뉴스" },
  { path: "/community", name: "커뮤니티" },
  { path: "/fundamental", name: "펀더멘탈" },
];

test.describe("페이지 네비게이션", () => {
  for (const { path, name } of publicPages) {
    test(`${name} (${path}) 페이지 접근 가능`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator("main")).toBeVisible();
    });
  }

  test("사이드바 링크로 페이지 이동", async ({ page }) => {
    await page.goto("/");
    // 종목 분석 링크 클릭
    const searchLink = page.locator("a[href='/search']").first();
    if (await searchLink.isVisible()) {
      await searchLink.click();
      await page.waitForURL("**/search");
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("존재하지 않는 페이지 처리", async ({ page }) => {
    const response = await page.goto("/nonexistent-page-12345");
    // 404 페이지 또는 리다이렉트
    expect(response?.status()).toBeLessThan(500);
  });
});
