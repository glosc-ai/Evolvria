import { expect, test } from "@playwright/test";

test("starts a local mock chat from the library", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /打开一个会记住你的故事宇宙/ })).toBeVisible();

  await page.getByRole("link", { name: /浏览内容库/ }).click();
  await expect(page.getByRole("heading", { name: "内容库", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "故事线：星烬边境" }).click();
  await expect(page.getByRole("heading", { name: "星烬边境" })).toBeVisible();
  await page.getByRole("button", { name: "安全" }).click();
  await expect(page.getByText("SFW / 本地就绪")).toBeVisible();
  await page.getByRole("button", { name: "变更记录" }).click();
  await expect(page.getByText("原创 MVP 种子内容。")).toBeVisible();

  await page.getByRole("link", { name: /开始/ }).click();
  await page.getByLabel("玩家档案名称").fill("测试旅人");
  await page.getByLabel("玩家档案描述").fill("喜欢先观察再行动的调查员。");
  await page.getByRole("button", { name: "开始聊天" }).click();

  await expect(page.getByRole("heading", { name: /星烬边境/ })).toBeVisible();
  await page.getByPlaceholder(/说一句话/).fill("我检查坐标片，并询问莉拉刚才听见了什么。");
  await page.getByRole("button", { name: /发送/ }).click();
  await expect(page.getByText(/你可以追问、观察周围/)).toBeVisible();
  await expect(page.getByText(/提示词契约 evolvria-narrative-v1\.0\.0/)).toBeVisible();
  await expect(page.getByText(/共同经历让信任略微上升/)).toBeVisible();
  await page.getByRole("button", { name: "标记消息" }).last().click();
  await expect(page.getByText("1 条已标记消息")).toBeVisible();
  await page.getByRole("button", { name: "移除书签" }).click();
  await expect(page.getByText("0 条已标记消息")).toBeVisible();
  await page.getByPlaceholder(/搜索对白/).fill("坐标片");
  await expect(page.getByText(/我检查坐标片/)).toBeVisible();
  const excerptDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^导出$/ }).click();
  await excerptDownload;
  await expect(page.getByText(/最近摘录/)).toBeVisible();
  await page.getByPlaceholder(/搜索对白/).fill("");

  await page.getByRole("button", { name: /摘要/ }).click();
  await expect(page.getByText(/章/)).toBeVisible();
  await page.getByLabel("摘要正文").fill("玩家检查坐标片，确认灯塔异常仍在扩大。");
  await page.getByLabel("摘要事实").fill("坐标片被检查\n灯塔异常扩大");
  await page.getByLabel("摘要未解线索").fill("坐标片来源");
  await page.getByRole("button", { name: /保存摘要/ }).click();
  await expect(page.getByText("1 次修订")).toBeVisible();
  await page.getByRole("button", { name: /回退摘要/ }).click();
  await expect(page.getByText("2 次修订")).toBeVisible();
  await page.getByLabel("剧情弧目标").fill("确认灯塔异常并保护莉拉。");
  await page.getByLabel("剧情节点 2 标题").fill("改从坐标片追线索");
  await page.getByLabel("剧情节点 2 状态").selectOption("skipped");
  await page.getByRole("button", { name: /保存剧情弧/ }).click();
  await expect(page.getByText("剧情弧已保存。")).toBeVisible();
  await expect(page.getByText("跳过：改从坐标片追线索")).toBeVisible();

  await page.getByRole("button", { name: /裁定/ }).click();
  await expect(page.getByText(/裁定检查/)).toBeVisible();

  await page.getByRole("button", { name: /消息 3 之前/ }).click();
  await expect(page.getByText(/已回滚到检查点/)).toBeVisible();

  await page.getByRole("link", { name: /场景/ }).click();
  await expect(page.getByText(/返回聊天/)).toBeVisible();
  await expect(page.getByText("文字速度")).toBeVisible();
  await page.getByRole("button", { name: /排队生成语音/ }).click();
  await expect(page.getByLabel("生成队列")).toContainText("语音 · 排队中");
  await page.getByLabel("生成队列").getByRole("button", { name: /^运行$/ }).click();
  await expect(page.getByLabel("生成队列")).toContainText("语音 · 已完成");
  await page.getByRole("button", { name: /排队生成图片/ }).click();
  await expect(page.getByLabel("生成队列")).toContainText("图片 · 排队中");
  await page.getByLabel("生成队列").getByRole("button", { name: /^运行$/ }).click();
  await expect(page.getByLabel("生成队列")).toContainText("图片 · 已完成");
  await page.getByRole("button", { name: /排队生成视频/ }).click();
  await expect(page.getByLabel("生成队列")).toContainText("视频 · 排队中");
  await page.getByLabel("生成队列").getByRole("button", { name: /^运行$/ }).click();
  await expect(page.getByLabel("生成队列")).toContainText("视频 · 已完成");
  await page.getByRole("button", { name: /历史/ }).click();
  await expect(page.getByLabel("场景历史")).toBeVisible();
  await expect(page.getByRole("button", { name: /暂停自动播放|自动播放/ })).toBeVisible();
  await page.getByRole("button", { name: /自动播放/ }).click();
  await expect(page.getByRole("button", { name: /暂停自动播放/ })).toBeVisible();
  await page.getByRole("button", { name: /编辑场景/ }).click();
  await expect(page.getByLabel("场景提示编辑器")).toBeVisible();
  await page.getByLabel("场景情绪").fill("tense dawn");
  await page.getByLabel("场景镜头").selectOption("close");
  await page.getByLabel("选项 1 标签").fill("环顾灯塔");
  await page.getByLabel("选项 1 消息").fill("我环顾灯塔，确认异常来源。");
  await page.getByRole("button", { name: /保存场景提示/ }).click();
  await expect(page.getByText("场景提示已保存。")).toBeVisible();
  await expect(page.getByRole("button", { name: "环顾灯塔" })).toBeVisible();
  await page.getByRole("button", { name: "环顾灯塔" }).click();
  await expect(page.getByText(/已发送选择：环顾灯塔/)).toBeVisible();
  await page.getByRole("link", { name: /返回聊天/ }).click();
  await expect(page.getByText(/我环顾灯塔/)).toBeVisible();
});

test("creates a local draft", async ({ page }) => {
  await page.goto("/create");
  const newStoryForm = page.locator("form").filter({ hasText: "新建故事线" });
  await newStoryForm.getByLabel("故事线标题").fill("苍白学院");
  await newStoryForm.getByLabel("一句话钩子").fill("钟声响起时，走廊会改写姓名。");
  await newStoryForm.getByLabel("摘要").fill("一座会记录选择的学院正在等待新的旁听生，每一次回答都会改变走廊和钟声。");
  await newStoryForm.getByLabel("主角色").fill("伊芙");
  await newStoryForm.getByLabel("开场场景").fill("雨停在窗外，黑板上却写着你的名字。");
  await newStoryForm.getByRole("button", { name: /保存新草稿/ }).click();
  await expect(page.getByText("草稿已创建。")).toBeVisible();
  await expect(page.getByLabel("提示词预览")).toContainText("系统策略");
  await expect(page.getByLabel("提示词预览")).toContainText("契约 evolvria-narrative-v1.0.0");
  await expect(page.getByLabel("提示词预览")).not.toContainText("sk-browser-preview");
  await page.getByRole("button", { name: /保存编辑/ }).click();
  await expect(page.getByText("草稿已保存。")).toBeVisible();

  const characterEditor = page.locator("form").filter({ hasText: "角色编辑器" });
  await characterEditor.locator('input[type="file"][accept="audio/*"]').first().setInputFiles({
    name: "eve-voice-reference.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("RIFF----WAVEfmt "),
  });
  await expect(page.getByText("语音参考已导入。请在标记本地就绪前确认授权。")).toBeVisible();
  await expect(characterEditor.getByText(/语音参考：伊芙 语音参考/)).toBeVisible();
  await characterEditor.getByRole("button", { name: /确认语音授权/ }).click();
  await expect(page.getByText("语音参考授权已确认。")).toBeVisible();
  await expect(characterEditor.getByText(/授权：自有/)).toBeVisible();

  const editForm = page.locator("form").filter({ hasText: "编辑内容包" });
  const createdStoryId = await editForm.getByLabel("选择内容包").inputValue();
  await page.goto(`/storylines/${createdStoryId}`);
  await page.getByRole("button", { name: "角色" }).click();
  await expect(page.getByText(/语音参考：伊芙 语音参考/)).toBeVisible();
  await expect(page.getByText(/授权 自有/)).toBeVisible();

  await page.goto(`/create?storyId=${createdStoryId}`);
  await page.getByRole("button", { name: "选择本地素材" }).click();
  await expect(page.getByText("媒体文件选择器需要 Tauri 桌面运行时或已选择的文件。")).toBeVisible();
  await page.getByLabel("本地素材路径").fill("/tmp/evolvria-native-cover.png");
  await page.getByRole("button", { name: "导入本地素材" }).click();
  await expect(page.getByText("本地媒体导入需要 Tauri 桌面运行时。")).toBeVisible();
  await page.getByRole("button", { name: "选择本地语音" }).click();
  await expect(page.getByText("语音文件选择器需要 Tauri 桌面运行时或已选择的文件。")).toBeVisible();

  await characterEditor.getByLabel("新角色姓名").fill("米娅");
  await characterEditor.getByLabel("副标题").fill("钟楼档案管理员");
  await characterEditor.getByLabel("阵容定位").fill("见证人");
  await characterEditor.getByLabel("目标").fill("保护档案，找回缺页");
  await characterEditor.getByLabel("关系种子").fill("她怀疑玩家带走了缺失的档案页。");
  await characterEditor.getByLabel("摘要").fill("她熟悉学院所有被删改过的名字，却害怕自己的记录也不可靠。");
  await characterEditor.getByLabel("档案").fill("米娅负责维护钟楼档案室。她表面谨慎冷淡，实际上在寻找一页与自己家族有关的缺失记录。");
  await characterEditor.getByLabel("说话语气").fill("谨慎、精确，偶尔露出焦虑。");
  await characterEditor.getByRole("button", { name: /添加角色/ }).click();
  await expect(page.getByText("角色已添加。")).toBeVisible();
  await expect(characterEditor.locator(".field-box").filter({ hasText: "米娅" }).first()).toBeVisible();

  const scenarioEditor = page.locator("form").filter({ hasText: "场景编辑器" });
  await scenarioEditor.getByLabel("新场景标题").fill("钟楼第二次敲响");
  await scenarioEditor.getByLabel("摘要").fill("第二个可启动入口，让玩家从钟楼档案室开始调查。");
  await scenarioEditor.getByLabel("地点").fill("钟楼档案室");
  await scenarioEditor.getByLabel("开场提示").fill("钟楼第二次敲响时，档案柜自己打开，露出一页写着你名字的借阅记录。");
  await scenarioEditor.getByRole("button", { name: /添加场景/ }).click();
  await expect(page.getByText("场景已添加。")).toBeVisible();
  await expect(page.getByText(/2\. 钟楼第二次敲响/)).toBeVisible();
  await scenarioEditor.locator(".field-box").filter({ hasText: "钟楼第二次敲响" }).getByRole("button", { name: /预览/ }).click();
  await expect(page.getByRole("heading", { name: /苍白学院 \/ 钟楼第二次敲响/ })).toBeVisible();
  await expect(page.getByText(/档案柜自己打开/)).toBeVisible();
  await page.getByRole("link", { name: /场景/ }).click();
  await expect(page.getByLabel("语音提示")).toContainText("已附加参考音频");
  await expect(page.getByLabel("语音提示")).toContainText("授权 owned");
  await expect(page.getByLabel("语音提示")).toContainText("暂无预览");
});

test("starts a chat with a saved persona", async ({ page }) => {
  await page.goto("/start/story_starbloom_frontier");
  await page.getByRole("button", { name: "已保存玩家档案" }).click();
  await expect(page.locator("form").getByLabel("已保存玩家档案")).toHaveValue("persona_default_traveler");
  await page.getByRole("button", { name: "开始聊天" }).click();
  await expect(page.getByText(/默认旅人 - 初次进入故事的观察者/)).toBeVisible();
});

test("archives and restores a chat without deleting it", async ({ page }) => {
  await page.goto("/start/story_starbloom_frontier");
  await page.getByRole("button", { name: "已保存玩家档案" }).click();
  await page.getByRole("button", { name: "开始聊天" }).click();
  await expect(page.getByRole("heading", { name: /星烬边境/ })).toBeVisible();

  await page.getByRole("button", { name: /归档/ }).click();
  await expect(page.getByRole("heading", { name: "星烬边境" })).toBeVisible();

  await page.goto("/saves");
  await expect(page.getByRole("heading", { name: "已归档聊天" })).toBeVisible();
  await expect(page.getByText(/星烬边境 \/ 灯塔第一次熄灭/)).toBeVisible();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(page.getByText("没有已归档聊天")).toBeVisible();
  await expect(page.getByRole("link", { name: /继续/ })).toBeVisible();
});

test("creates and restores a workspace backup", async ({ page }) => {
  await page.goto("/saves");
  const originalName = (await page.locator(".field-box strong").first().innerText()).trim();
  await page.getByRole("button", { name: /^备份$/ }).click();
  await expect(page.getByText(/备份已创建：/)).toBeVisible();
  await expect(page.getByText("manual · backup_", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /刷新素材清单/ }).click();
  await expect(page.getByText(/浏览器素材清单仅使用元数据/)).toBeVisible();
  await expect(page.getByText("2 个声明素材", { exact: true })).toBeVisible();
  await expect(page.getByText("维护计划", { exact: true })).toBeVisible();
  await expect(page.getByText(/替换占位素材/).first()).toBeVisible();
  await page.getByLabel("本地索引查询").fill("星烬");
  await page.getByRole("button", { name: /重建 SQLite 索引/ }).click();
  await expect(page.getByText(/本地 SQLite 索引需要 Tauri 桌面运行时/)).toBeVisible();

  await page.evaluate(() => {
    const raw = localStorage.getItem("evolvria:workspace:active");
    if (!raw) throw new Error("missing_workspace");
    const envelope = JSON.parse(raw);
    envelope.workspace.name = "Backup Restore Mutated Workspace";
    envelope.workspace.updatedAt = "2026-07-02T05:00:00.000Z";
    localStorage.setItem("evolvria:workspace:active", JSON.stringify(envelope));
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Backup Restore Mutated Workspace" })).toBeVisible();

  await page.getByRole("button", { name: /恢复备份/ }).first().click();
  await expect(page.getByText(/已从 backup_/)).toBeVisible();
  await expect(page.getByText(originalName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("pre_restore · backup_", { exact: false })).toBeVisible();
});

test("duplicates a storyline into Creator Studio as a local draft", async ({ page }) => {
  await page.goto("/storylines/story_starbloom_frontier");
  await page.getByRole("button", { name: /复制/ }).click();
  await expect(page).toHaveURL(/\/create\?storyId=.*duplicated=1/);
  await expect(page.getByText("已复制为本地草稿。")).toBeVisible();

  const editForm = page.locator("form").filter({ hasText: "编辑内容包" });
  await expect(editForm.getByRole("textbox", { name: "标题" }).first()).toHaveValue("星烬边境 本地副本");
  await expect(page.getByText(/草稿 \/ 草稿 \/ SFW/)).toBeVisible();
});

test("exports and imports a creator storyline package", async ({ page }) => {
  await page.goto("/create");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出故事内容包/ }).click();
  const download = await downloadPromise;
  const packagePath = await download.path();
  expect(packagePath).toBeTruthy();
  await expect(page.getByText(/故事线内容包已导出/)).toBeVisible();
  await page.locator('input[accept="application/json,.json,.evolvria.json"]').setInputFiles(packagePath!);
  await expect(page.getByText("故事线内容包已作为本地草稿导入。")).toBeVisible();
  const editForm = page.locator("form").filter({ hasText: "编辑内容包" });
  await expect(editForm.getByRole("textbox", { name: "标题" }).first()).toHaveValue(/导入草稿/);
});

test("moves a local package to trash and restores it", async ({ page }) => {
  await page.goto("/create");
  const newStoryForm = page.locator("form").filter({ hasText: "新建故事线" });
  await newStoryForm.getByLabel("故事线标题").fill("回收站学院");
  await newStoryForm.getByLabel("一句话钩子").fill("误删也能找回。");
  await newStoryForm.getByLabel("摘要").fill("一个用于验证本地软删除和恢复的原创故事线，确保内容不会从工作区中直接消失。");
  await newStoryForm.getByLabel("主角色").fill("档案员");
  await newStoryForm.getByLabel("开场场景").fill("档案柜合上之前，你看见标签仍在发光。");
  await newStoryForm.getByRole("button", { name: /保存新草稿/ }).click();
  await expect(page.getByText("草稿已创建。")).toBeVisible();

  const editForm = page.locator("form").filter({ hasText: "编辑内容包" });
  const createdStoryId = await editForm.getByLabel("选择内容包").inputValue();
  await editForm.getByRole("button", { name: /移入废纸篓/ }).click();
  await expect(page.getByText(/内容包已移入废纸篓/)).toBeVisible();

  await page.goto("/library");
  await page.getByPlaceholder(/标题、角色、场景/).fill("回收站学院");
  await expect(page.getByRole("link", { name: "故事线：回收站学院" })).not.toBeVisible();

  await page.goto(`/create?storyId=${createdStoryId}`);
  await expect(page.getByText("位于废纸篓")).toBeVisible();
  await page.getByRole("button", { name: /恢复内容包/ }).click();
  await expect(page.getByText("内容包已恢复。")).toBeVisible();

  await page.goto("/library");
  await page.getByPlaceholder(/标题、角色、场景/).fill("回收站学院");
  await expect(page.getByRole("link", { name: "故事线：回收站学院" })).toBeVisible();
});

test("edits version and changelog as a new local draft", async ({ page }) => {
  await page.goto("/create?storyId=story_starbloom_frontier");
  const editForm = page.locator("form").filter({ hasText: "编辑内容包" });
  await editForm.getByLabel("版本").fill("0.2.0 beta");
  await editForm.getByLabel("变更记录").fill("扩展场景入口。");
  await editForm.getByLabel("一句话钩子").fill("灯塔重新点亮，第二条航线开始回应。");
  await editForm.getByRole("button", { name: /保存编辑/ }).click();
  await expect(page.getByText("草稿已保存。")).toBeVisible();
  await expect(page.getByText(/0\.2\.0-beta \/ 草稿 \/ 草稿 \/ SFW/)).toBeVisible();

  await page.goto("/storylines/story_starbloom_frontier");
  await page.getByRole("button", { name: "变更记录" }).click();
  await expect(page.getByText("0.2.0-beta / 草稿")).toBeVisible();
  await expect(page.getByText("扩展场景入口。")).toBeVisible();
});

test("validates seed content as local ready", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("button", { name: /标记本地就绪/ }).click();
  await expect(page.getByText("已标记为本地就绪。")).toBeVisible();
});

test("edits Fate Engine rules and applies full roll visibility", async ({ page }) => {
  await page.goto("/create");
  const fateForm = page.locator("form").filter({ hasText: "Fate 裁定引擎" });
  await fateForm.getByLabel("骰子").selectOption("2d6");
  await fateForm.getByLabel("可见性").selectOption("full");
  await fateForm.getByLabel("标准目标").fill("9");
  await fateForm.getByLabel("属性", { exact: true }).fill("勇气");
  await fateForm.getByLabel("技能", { exact: true }).fill("稳态");
  await fateForm.getByLabel("后果标签").fill("压力钟");
  await fateForm.getByLabel("后果描述").fill("失败时推进一格危险。");
  await fateForm.getByRole("button", { name: /保存 Fate 规则/ }).click();
  await expect(page.getByText("Fate 裁定规则已保存。")).toBeVisible();

  await page.goto("/start/story_starbloom_frontier");
  await page.getByRole("button", { name: "已保存玩家档案" }).click();
  await page.getByRole("button", { name: "开始聊天" }).click();
  const dungeonMindForm = page.getByRole("form", { name: "裁定检查" });
  await dungeonMindForm.getByLabel("裁定意图").fill("我用稳态读势稳住星门。");
  await dungeonMindForm.getByLabel("难度目标").fill("9");
  await dungeonMindForm.getByLabel("修正值").fill("3");
  await dungeonMindForm.getByLabel("裁定种子").fill("e2e-fate-seed");
  await dungeonMindForm.getByRole("button", { name: /运行检查/ }).click();
  const fateMessage = page.locator("article.message.fate").filter({ hasText: "我用稳态读势稳住星门" });
  await expect(fateMessage).toBeVisible();
  await expect(fateMessage).toContainText(/属性 勇气 \/ 技能 稳态/);
  await page.getByRole("button", { name: /裁定/ }).click();
  await expect(page.locator("article.message.fate").filter({ hasText: "掷骰" })).toHaveCount(2);
});

test("blocks risky creator package text from local_ready", async ({ page }) => {
  await page.goto("/create");
  const newStoryForm = page.locator("form").filter({ hasText: "新建故事线" });
  await newStoryForm.getByLabel("故事线标题").fill("镜像学院");
  await newStoryForm.getByLabel("一句话钩子").fill("一份危险的复刻草稿。");
  await newStoryForm.getByLabel("摘要").fill("这是一个用于验证本地审核的草稿，它提到了 ISEKAI ZERO 和 copyright 风险，不应进入本地就绪。");
  await newStoryForm.getByLabel("主角色").fill("审校员");
  await newStoryForm.getByLabel("开场场景").fill("审校室里的红色标签亮起。");
  await newStoryForm.getByRole("button", { name: /保存新草稿/ }).click();

  await expect(page.getByText(/版权或竞品引用风险/)).toBeVisible();
  await expect(page.getByRole("button", { name: /标记本地就绪/ })).toBeDisabled();
});

test("blocks publish submission when package contains browser-only assets", async ({ page }) => {
  await page.goto("/create");
  const newStoryForm = page.locator("form").filter({ hasText: "新建故事线" });
  await newStoryForm.getByLabel("故事线标题").fill("便携性检查故事");
  await newStoryForm.getByLabel("一句话钩子").fill("只有可打包资产才能进入发布队列。");
  await newStoryForm.getByLabel("摘要").fill("这是一个用于验证发布前包检查的原创故事线，包含本地浏览器临时媒体引用。");
  await newStoryForm.getByLabel("主角色").fill("包检查员");
  await newStoryForm.getByLabel("开场场景").fill("桌上放着一份等待审核的内容包。");
  await newStoryForm.getByRole("button", { name: /保存新草稿/ }).click();
  await expect(page.getByText("草稿已创建。")).toBeVisible();

  const editForm = page.locator("form").filter({ hasText: "编辑内容包" });
  const createdStoryId = await editForm.getByLabel("选择内容包").inputValue();
  await page.locator('input[type="file"][accept="image/*,audio/*,video/*"]').setInputFiles({
    name: "browser-only-cover.png",
    mimeType: "image/png",
    buffer: Buffer.from("png-placeholder"),
  });
  await expect(page.getByText("媒体已导入。请在标记本地就绪前确认授权。")).toBeVisible();
  await page.getByRole("button", { name: /生成缩略图/ }).click();
  await expect(page.getByText(/缩略图生成需要在 Tauri 桌面运行时导入的图片素材/)).toBeVisible();
  await page.getByRole("button", { name: /快速确认/ }).click();

  await page.goto("/account");
  const publishForm = page.locator("form").filter({ hasText: "发布模拟" });
  await publishForm.getByLabel("故事线").selectOption(createdStoryId);
  await publishForm.getByRole("button", { name: /提交审核/ }).click();
  await expect(page.getByText(/被 .* 个校验问题阻止/)).toBeVisible();
  await expect(page.getByText(/内容包校验需要处理/)).toBeVisible();
  await expect(page.getByText(/浏览器临时素材.*重新导入/)).toBeVisible();
});

test("filters and sorts the unified local library", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "场景" }).click();
  await page.getByPlaceholder(/标题、角色、场景/).fill("逆潮");
  await expect(page.getByText("逆潮靠岸")).toBeVisible();
  await expect(page.getByText("灯塔第一次熄灭")).not.toBeVisible();

  await page.getByPlaceholder(/标题、角色、场景/).fill("");
  await page.getByLabel("模式").selectOption("fate");
  await expect(page.getByText("灯塔第一次熄灭")).toBeVisible();
  await expect(page.getByText("逆潮靠岸")).not.toBeVisible();

  await page.getByRole("button", { name: /审核/ }).click();
  await expect(page.getByText(/本地就绪|默认/)).toBeVisible();
});

test("blocks chat send when estimated cost exceeds budget", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("API Key").fill("sk-browser-preview");
  await page.getByRole("button", { name: /保存设置/ }).click();
  await expect(page.getByText(/API Key 后端：browser_local_storage/)).toBeVisible();
  await page.getByRole("button", { name: /清除 API Key/ }).click();
  await expect(page.getByText(/提供方密钥已清除。后端：browser_local_storage/)).toBeVisible();
  await page.getByLabel("单轮最大预估成本").fill("0");
  await page.getByRole("button", { name: /保存设置/ }).click();
  await expect(page.getByText("设置已保存。")).toBeVisible();

  await page.goto("/start/story_starbloom_frontier");
  await page.getByLabel("玩家档案名称").fill("预算测试员");
  await page.getByLabel("玩家档案描述").fill("只验证预算拦截。");
  await page.getByRole("button", { name: "开始聊天" }).click();

  await page.getByPlaceholder(/说一句话/).fill("我检查坐标片，并询问莉拉刚才听见了什么。");
  await expect(page.getByText(/超过单轮上限/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^发送$/ })).toBeDisabled();
});

test("summarizes older chat context before continuing under input limit", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("最大输入 tokens").fill("8000");
  await page.getByLabel("单轮最大预估成本").fill("1");
  await page.getByRole("button", { name: /保存设置/ }).click();
  await expect(page.getByText("设置已保存。")).toBeVisible();

  await page.goto("/start/story_starbloom_frontier");
  await page.getByLabel("玩家档案名称").fill("上下文整理员");
  await page.getByLabel("玩家档案描述").fill("验证上下文压力下自动摘要再继续。");
  await page.getByRole("button", { name: "开始聊天" }).click();

  for (let index = 1; index <= 5; index += 1) {
    await page.getByPlaceholder(/说一句话/).fill(`第 ${index} 轮，我详细记录灯塔、坐标片、逆潮和莉拉听见的钟声，并要求继续追踪这些线索。`);
    await page.getByRole("button", { name: /^发送$/ }).click();
    await expect(page.getByText(new RegExp(`第 ${index + 1} 个节拍里`))).toBeVisible();
  }

  const chatUrl = page.url();
  await page.goto("/settings");
  await page.getByLabel("最大输入 tokens").fill("320");
  await page.getByLabel("单轮最大预估成本").fill("1");
  await page.getByRole("button", { name: /保存设置/ }).click();
  await expect(page.getByText("设置已保存。")).toBeVisible();

  await page.goto(chatUrl);
  await page.getByPlaceholder(/说一句话/).fill("继续。");
  await page.getByRole("button", { name: /^发送$/ }).click();
  await expect(page.getByText(/已在生成前整理上下文摘要/)).toBeVisible();
  await expect(page.getByText("1 章", { exact: true })).toBeVisible();
});

test("windows long chat messages and can load older entries", async ({ page }) => {
  await page.goto("/start/story_starbloom_frontier");
  await page.getByLabel("玩家档案名称").fill("长聊天测试员");
  await page.getByLabel("玩家档案描述").fill("验证长聊天窗口和全文搜索。");
  await page.getByRole("button", { name: "开始聊天" }).click();
  await expect(page.getByRole("heading", { name: /星烬边境/ })).toBeVisible();

  const chatId = new URL(page.url()).pathname.split("/").at(-1);
  if (!chatId) throw new Error("missing_chat_id");
  await page.evaluate((activeChatId) => {
    const raw = localStorage.getItem("evolvria:workspace:active");
    if (!raw) throw new Error("missing_workspace");
    const envelope = JSON.parse(raw);
    const chat = envelope.entities.chats[activeChatId];
    if (!chat) throw new Error("missing_chat");
    const generatedIds: string[] = [];
    for (let index = 0; index < 95; index += 1) {
      const id = `msg_window_e2e_${index}`;
      generatedIds.push(id);
      envelope.entities.messages[id] = {
        id,
        chatId: activeChatId,
        role: index % 2 === 0 ? "user" : "assistant",
        content: index === 3 ? "古早坐标片线索只应该通过全文搜索出现。" : `长聊天窗口消息 ${index}`,
        safetyFlags: ["none"],
        createdAt: `2026-07-02T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
      };
    }
    chat.messageIds = [...chat.messageIds, ...generatedIds];
    chat.updatedAt = "2026-07-02T01:40:00.000Z";
    envelope.workspace.updatedAt = chat.updatedAt;
    localStorage.setItem("evolvria:workspace:active", JSON.stringify(envelope));
  }, chatId);

  await page.reload();
  await expect(page.getByText(/显示最近 80 \/ 97 条消息/)).toBeVisible();
  await expect(page.getByText("古早坐标片线索只应该通过全文搜索出现。")).not.toBeVisible();
  await page.getByRole("button", { name: /预览分页/ }).click();
  await expect(page.getByText(/浏览器 JSON 消息分页预览：80 \/ 97/)).toBeVisible();
  await expect(page.getByText(/第 18-97 行 \/ 共 97/)).toBeVisible();
  await page.getByRole("button", { name: /更早分页/ }).click();
  await expect(page.getByText(/浏览器 JSON 消息分页预览：17 \/ 97/)).toBeVisible();
  await expect(page.getByText(/第 1-17 行 \/ 共 97/)).toBeVisible();
  await page.getByPlaceholder(/搜索对白/).fill("古早坐标片");
  await expect(page.getByText("搜索结果：1 条消息。")).toBeVisible();
  await expect(page.getByText("古早坐标片线索只应该通过全文搜索出现。")).toBeVisible();
  await page.getByPlaceholder(/搜索对白/).fill("");
  await page.getByRole("button", { name: /加载更早 17 条/ }).click();
  await expect(page.getByText("已显示全部 97 条消息。")).toBeVisible();
  await expect(page.locator(".message-list article").filter({ hasText: "长聊天窗口消息 0" }).first()).toBeVisible();
});

test("recovers a failed provider turn by switching to mock and retrying", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("提供方").selectOption("local-http");
  await page.getByLabel("基础 URL").fill("http://127.0.0.1:9/v1");
  await page.getByLabel("模型").fill("dead-local-provider");
  await page.getByRole("button", { name: /保存设置/ }).click();
  await expect(page.getByText("设置已保存。")).toBeVisible();

  await page.goto("/start/story_starbloom_frontier");
  await page.getByLabel("玩家档案名称").fill("失败恢复测试员");
  await page.getByLabel("玩家档案描述").fill("只验证 provider 失败后的重试路径。");
  await page.getByRole("button", { name: "开始聊天" }).click();
  await page.getByPlaceholder(/说一句话/).fill("我尝试触发一次失败，然后切换到 mock。");
  await page.getByRole("button", { name: /^发送$/ }).click();

  await expect(page.getByText(/提供方调用失败/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^重试$/ })).toBeEnabled();
  await page.getByRole("button", { name: /切换到模拟提供方/ }).click();
  await page.getByRole("button", { name: /立即重试/ }).click();
  await expect(page.getByText(/你可以追问、观察周围/)).toBeVisible();
});

test("exports and imports a browser workspace JSON fallback", async ({ page }) => {
  await page.goto("/saves");
  await page.getByRole("button", { name: /校验内容包/ }).click();
  await expect(page.getByText("内容包校验通过", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await expect(page.getByText("内容包校验通过", { exact: true })).toBeVisible();
  await expect(page.getByText(/引用素材/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(path!);
  await expect(page.getByText(/JSON 工作区已导入为/)).toBeVisible();
  await expect(page.getByText("内容包校验通过", { exact: true })).toBeVisible();
});

test("opens cloud platform preview and records local moderation", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: /账号、同步、用户内容/ })).toBeVisible();
  await page.getByLabel("显示名称").fill("云端预览创作者");
  await page.getByLabel("邮箱").fill("creator@example.test");
  await page.getByLabel("年龄门槛").selectOption("adult");
  await page.getByRole("button", { name: /本地登录/ }).click();
  await expect(page.getByText("已以 云端预览创作者 本地登录。", { exact: true })).toBeVisible();
  await expect(page.getByText(/权限：同步, 发布, 账单, 成人内容/)).toBeVisible();
  await page.getByRole("link", { name: /打开创作者主页/ }).click();
  await expect(page.getByRole("heading", { name: /Evolvria Studio|云端预览创作者/ })).toBeVisible();
  await expect(page.getByText(/主页快照/)).toBeVisible();
  await page.getByRole("button", { name: /创建本地创作者举报/ }).click();
  await expect(page.getByText("创作者举报已加入本地审核队列。")).toBeVisible();
  await page.getByRole("link", { name: /审核队列/ }).click();
  await page.getByLabel("模式").selectOption({ label: "准备云端同步" });
  await page.getByRole("button", { name: /保存同步状态/ }).click();
  await expect(page.getByText(/同步设置已保存到本地/)).toBeVisible();
  await page.getByRole("button", { name: /刷新设备快照/ }).click();
  await expect(page.getByText("设备快照", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /排队更新/ }).click();
  await expect(page.getByText(/已排队一个本地同步操作/)).toBeVisible();
  await page.getByRole("button", { name: /刷新设备快照/ }).click();
  await expect(page.getByText(/待处理 1/)).toBeVisible();
  const syncDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出操作日志/ }).click();
  const syncDownload = await syncDownloadPromise;
  const syncLogPath = await syncDownload.path();
  expect(syncLogPath).toBeTruthy();
  await expect(page.getByText(/已导出 1 个同步操作/).first()).toBeVisible();
  await page.getByLabel("导入同步操作日志").setInputFiles(syncLogPath!);
  await expect(page.getByText(/已导入 0 个操作，跳过 1 个/).first()).toBeVisible();
  await page.getByRole("button", { name: /模拟推送/ }).click();
  await expect(page.getByText(/模拟推送已确认/)).toBeVisible();
  await page.getByRole("button", { name: /关闭并保留本地/ }).click();
  await expect(page.getByText(/私有同步已关闭/).first()).toBeVisible();
  await expect(page.getByText(/仅本地 \/ 冲突/)).toBeVisible();
  await page.getByRole("button", { name: /创建冲突/ }).click();
  await expect(page.getByText(/title 冲突/)).toBeVisible();
  await page.getByRole("button", { name: /使用云端/ }).click();
  await expect(page.getByText(/冲突已按云端版本解决/)).toBeVisible();
  await page.getByLabel("可用收益金额").fill("12.5");
  await page.getByRole("button", { name: /添加可用收益/ }).click();
  await expect(page.getByText(/可用收益预览已添加/)).toBeVisible();
  await page.getByRole("button", { name: /申请提现预览/ }).click();
  await expect(page.getByText(/提现预览已申请/).first()).toBeVisible();
  await expect(page.getByText(/已申请 \/ 12.5 credit/)).toBeVisible();
  await page.getByRole("button", { name: /拦截并暂扣/ }).first().click();
  await expect(page.getByText(/提现拦截已记录/)).toBeVisible();
  await expect(page.getByText(/已拦截 \/ 12.5 credit/)).toBeVisible();
  await page.getByRole("button", { name: /添加积分预估/ }).click();
  await expect(page.getByText(/待处理 \/ 聊天/)).toBeVisible();
  await page.getByRole("button", { name: "冻结" }).first().click();
  await expect(page.getByText(/账本冻结已记录/)).toBeVisible();
  await page.getByRole("button", { name: "退款" }).first().click();
  await expect(page.getByText(/账本退款已记录/)).toBeVisible();
  await page.getByRole("button", { name: /创建本地案例/ }).click();
  await expect(page.getByText(/个本地案例/)).toBeVisible();
  await page.getByRole("button", { name: /要求修改/ }).first().click();
  await expect(page.getByText(/目标现在需要修改/)).toBeVisible();
  await page.getByRole("button", { name: /提交审核/ }).click();
  await expect(page.getByText(/已提交到本地审核队列/)).toBeVisible();
  await page.getByRole("button", { name: "通过" }).first().click();
  await expect(page.getByText(/公开就绪占位状态/)).toBeVisible();
  await page.getByRole("button", { name: /创建本地案例/ }).click();
  await page.getByRole("button", { name: "拒绝" }).first().click();
  await expect(page.getByText(/目标被阻止发布/)).toBeVisible();
  await page.getByLabel("申诉原因").fill("创作者申诉：已更新来源备注并请求二次复核。");
  await page.getByRole("button", { name: "申诉" }).first().click();
  await expect(page.getByText(/申诉已随审计元数据提交到本地/)).toBeVisible();
  await expect(page.getByText(/申诉 开放：创作者申诉/)).toBeVisible();
  await page.getByRole("button", { name: /维持申诉/ }).first().click();
  await expect(page.getByText(/申诉已在本地维持/)).toBeVisible();
  await expect(page.getByText(/申诉 已维持：创作者申诉/)).toBeVisible();
});

test("publishes an approved storyline into public catalog and reports it from detail", async ({ page }) => {
  await page.goto("/account");
  const publishForm = page.locator("form").filter({ hasText: "发布模拟" });
  await publishForm.getByLabel("故事线").selectOption("story_starbloom_frontier");
  await publishForm.getByRole("button", { name: /提交审核/ }).click();
  await expect(page.getByText(/已提交到本地审核队列/)).toBeVisible();
  await page.getByRole("button", { name: "通过" }).first().click();
  await expect(page.getByText(/公开就绪占位状态/)).toBeVisible();

  await page.goto("/library");
  await page.getByLabel("目录").selectOption("public");
  await page.getByPlaceholder(/标题、角色、场景/).fill("星烬");
  await expect(page.getByLabel("公开推荐")).toContainText("星烬边境");
  await expect(page.getByRole("link", { name: "故事线：星烬边境" }).first()).toBeVisible();
  await page.getByRole("link", { name: "故事线：星烬边境" }).first().click();
  await page.getByRole("button", { name: "安全" }).click();
  await page.getByLabel("故事线举报原因").fill("公开目录举报：可见性应在推荐前复核。");
  await page.getByRole("button", { name: /创建举报/ }).click();
  await expect(page.getByText("故事线举报已加入本地审核队列。")).toBeVisible();

  await page.goto("/account");
  await expect(page.getByText(/可见性应在推荐前复核/)).toBeVisible();
  await page.getByRole("button", { name: /要求修改/ }).first().click();
  await expect(page.getByText(/目标现在需要修改/)).toBeVisible();

  await page.goto("/library");
  await page.getByLabel("目录").selectOption("public");
  await page.getByPlaceholder(/标题、角色、场景/).fill("星烬");
  await expect(page.getByRole("link", { name: "故事线：星烬边境" })).not.toBeVisible();
});
