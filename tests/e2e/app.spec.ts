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

test("remote AI calls require confirmation and local mock does not", async ({ page }) => {
  const remoteSettings = {
    glosc_base_url: "https://one.gloscai.com",
    glosc_token: "test-token",
    confirm_ai_calls: true,
    local_token_risk_acknowledged: true,
    onboarding_completed: true,
  };
  const localSettings = { ...remoteSettings, glosc_token: "" };

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
  await expect(page.getByRole("dialog", { name: "确认调用 Glosc One 扩写世界" })).toBeVisible();
  await expect(page.getByText("用量估算")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("dialog", { name: "确认调用 Glosc One 扩写世界" })).toBeHidden();

  await page.evaluate((settings) => localStorage.setItem("evolvria.settings", JSON.stringify(settings)), localSettings);
  await page.reload();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "下一步" }).click();
  }
  await page.getByRole("button", { name: "创建并扩写世界" }).click();
  await expect(page.getByText("当前地点")).toBeVisible();

  await page.evaluate((settings) => localStorage.setItem("evolvria.settings", JSON.stringify(settings)), remoteSettings);
  await page.reload();
  await page.getByPlaceholder("输入你的行动...").fill("调查公告上的徽记");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("dialog", { name: "确认调用 Glosc One 解析行动" })).toBeVisible();
  await expect(page.getByText(/玩家行动 · 预计 Token/)).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("dialog", { name: "确认调用 Glosc One 解析行动" })).toBeHidden();
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
