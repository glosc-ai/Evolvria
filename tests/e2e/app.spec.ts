import { expect, test } from "@playwright/test";

test("main menu keeps continue unhighlighted when there is no active world", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");

  await expect(page.getByText("还没有世界。先创建一个世界，或从存档页导入已有存档。")).toBeVisible();
  const continueButton = page.getByRole("button", { name: /继续游戏/ });
  await expect(continueButton).toBeDisabled();
  await expect(continueButton).toHaveAttribute("data-variant", "outline");
  await expect(page.getByRole("link", { name: /新建世界/ })).toBeVisible();
});

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

test("new world character fields keep clear labels while editing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /新建世界/ }).click();

  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByLabel("能力", { exact: true })).toHaveValue("观察,推理");
  await expect(page.getByLabel("弱点", { exact: true })).toHaveValue("过度谨慎");

  await page.getByRole("button", { name: "下一步" }).click();
  const firstCharacter = page.getByRole("group", { name: "关键角色 1" });
  await expect(firstCharacter).toBeVisible();
  await expect(firstCharacter.getByLabel("姓名", { exact: true })).toHaveValue("璃安");
  await expect(firstCharacter.getByLabel("身份", { exact: true })).toHaveValue("旧友");
  await expect(firstCharacter.getByLabel("与主角关系", { exact: true })).toHaveValue("同行");
  await expect(firstCharacter.getByLabel("行动倾向", { exact: true })).toHaveValue(/保护主角/);

  const secondCharacter = page.getByRole("group", { name: "关键角色 2" });
  await expect(secondCharacter.getByLabel("姓名", { exact: true })).toHaveValue("赛拉");
  await expect(secondCharacter.getByLabel("秘密", { exact: true })).toHaveValue("曾为边境守望工作");
});

test("exploration hides travel suggestions for the current location", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.getByRole("link", { name: /新建世界/ }).click();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "下一步" }).click();
  }
  await page.getByRole("button", { name: "创建并扩写世界" }).click();
  await expect(page.getByText("当前地点")).toBeVisible();

  await expect(page.getByRole("button", { name: "前往雾松林" })).toBeVisible();
  await page.getByRole("button", { name: "前往 雾松林" }).click();
  await expect(page.getByText("雾气常年不散")).toBeVisible();
  await expect(page.getByRole("button", { name: "前往雾松林" })).toBeHidden();
});

test("AI calls proceed without confirmation dialogs", async ({ page }) => {
  const remoteSettings = {
    glosc_base_url: "https://one.gloscai.com",
    glosc_token: "test-token",
    confirm_ai_calls: true,
    local_token_risk_acknowledged: true,
    onboarding_completed: true,
  };

  await page.goto("/");
  await page.evaluate((settings) => {
    localStorage.clear();
    localStorage.setItem("evolvria.settings", JSON.stringify(settings));
  }, remoteSettings);

  await page.goto("/");
  await page.getByRole("link", { name: /新建世界/ }).click();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "下一步" }).click();
  }
  await page.getByRole("button", { name: "创建并扩写世界" }).click();
  await expect(page.locator('[role="dialog"]')).toBeHidden();
  await expect(page.getByText("当前地点")).toBeVisible();

  await page.getByPlaceholder("输入你的行动...").fill("调查公告上的徽记");
  await page.keyboard.press("Control+Enter");
  await expect(page.locator('[role="dialog"]')).toBeHidden();
});

test("save deletion confirmation removes the selected entry", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "evolvria.active_world",
      JSON.stringify({
        schema_version: 1,
        world: { id: "world_delete_test", name: "测试删除世界" },
        characters: [],
        locations: [],
        factions: [],
        timeline: [],
        memories: [],
        ai_logs: [],
        threads: [],
        suggested_actions: [],
        updated_at: "2026-07-01T00:00:00.000Z",
      }),
    );
  });
  await page.goto("/#/saves");

  await expect(page.getByText("测试删除世界")).toBeVisible();
  await page.getByRole("button", { name: "删除存档" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "确认删除" }).click();

  await expect(page.getByText("测试删除世界")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("evolvria.active_world"))).toBeNull();
});

test("onboarding only enables remote start after key and risk acknowledgement", async ({ page }) => {
  await page.goto("/#/onboarding");
  await expect(page.getByRole("heading", { name: "初始配置" })).toBeVisible();
  await expect(page.getByText("不填写访问 Key 时，请使用本地模拟开始。")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存并开始" })).toBeDisabled();

  await page.getByLabel("访问 Key").fill("test-token");
  await expect(page.getByRole("button", { name: "保存并开始" })).toBeDisabled();
  await expect(page.getByText("保存访问 Key 前需要勾选本机存储风险确认。")).toBeVisible();

  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "保存并开始" })).toBeEnabled();
});
