import { expect, test } from "@playwright/test";

test("main flows render across viewports", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /让角色、地点和时间线/ })).toBeVisible();
  await page.getByRole("link", { name: /新建世界/ }).click();
  await expect(page.getByRole("heading", { name: "新建世界" })).toBeVisible();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "下一步" }).click();
  }
  await page.getByRole("button", { name: "创建并扩写世界" }).click();
  await expect(page.getByText("当前地点")).toBeVisible();
  await page.getByRole("link", { name: /地图/ }).click();
  await expect(page.getByRole("heading", { name: "地图" })).toBeVisible();
  await page.getByRole("link", { name: /人物/ }).click();
  await expect(page.getByRole("heading", { name: "人物名册" })).toBeVisible();
  await page.getByRole("link", { name: /时间线/ }).click();
  await expect(page.getByRole("heading", { name: "时间线" })).toBeVisible();
});
