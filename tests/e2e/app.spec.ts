import { expect, test } from "@playwright/test";

test("starts a local mock chat from the library", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /打开一个会记住你的故事宇宙/ })).toBeVisible();

  await page.getByRole("link", { name: /Browse Library/ }).click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "storyline: 星烬边境" }).click();
  await expect(page.getByRole("heading", { name: "星烬边境" })).toBeVisible();
  await page.getByRole("button", { name: "Safety" }).click();
  await expect(page.getByText("SFW / local_ready")).toBeVisible();
  await page.getByRole("button", { name: "Changelog" }).click();
  await expect(page.getByText("Original MVP seed.")).toBeVisible();

  await page.getByRole("link", { name: /Start/ }).click();
  await page.getByLabel("Persona name").fill("测试旅人");
  await page.getByLabel("Persona description").fill("喜欢先观察再行动的调查员。");
  await page.getByRole("button", { name: "Start Chat" }).click();

  await expect(page.getByRole("heading", { name: /星烬边境/ })).toBeVisible();
  await page.getByPlaceholder(/说一句话/).fill("我检查坐标片，并询问莉拉刚才听见了什么。");
  await page.getByRole("button", { name: /Send/ }).click();
  await expect(page.getByText(/你可以追问、观察周围/)).toBeVisible();
  await expect(page.getByText(/Prompt contract evolvria-narrative-v1\.0\.0/)).toBeVisible();
  await expect(page.getByText(/共同经历让信任略微上升/)).toBeVisible();
  await page.getByRole("button", { name: "Bookmark message" }).last().click();
  await expect(page.getByText("1 marked message(s)")).toBeVisible();
  await page.getByRole("button", { name: "Remove bookmark" }).click();
  await expect(page.getByText("0 marked message(s)")).toBeVisible();
  await page.getByPlaceholder(/搜索对白/).fill("坐标片");
  await expect(page.getByText(/我检查坐标片/)).toBeVisible();
  const excerptDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Export$/ }).click();
  await excerptDownload;
  await expect(page.getByText(/Last excerpt/)).toBeVisible();
  await page.getByPlaceholder(/搜索对白/).fill("");

  await page.getByRole("button", { name: /Summary/ }).click();
  await expect(page.getByText(/chapters/)).toBeVisible();
  await page.getByLabel("Summary text").fill("玩家检查坐标片，确认灯塔异常仍在扩大。");
  await page.getByLabel("Summary facts").fill("坐标片被检查\n灯塔异常扩大");
  await page.getByLabel("Summary open threads").fill("坐标片来源");
  await page.getByRole("button", { name: /Save Summary/ }).click();
  await expect(page.getByText("1 revision(s)")).toBeVisible();
  await page.getByRole("button", { name: /Revert Summary/ }).click();
  await expect(page.getByText("2 revision(s)")).toBeVisible();
  await page.getByLabel("Arc goal").fill("确认灯塔异常并保护莉拉。");
  await page.getByLabel("Arc beat 2 title").fill("改从坐标片追线索");
  await page.getByLabel("Arc beat 2 status").selectOption("skipped");
  await page.getByRole("button", { name: /Save Arc/ }).click();
  await expect(page.getByText("Arc saved.")).toBeVisible();
  await expect(page.getByText("skipped: 改从坐标片追线索")).toBeVisible();

  await page.getByRole("button", { name: /Fate/ }).click();
  await expect(page.getByText(/Fate Check/)).toBeVisible();

  await page.getByRole("button", { name: /Before message 3/ }).click();
  await expect(page.getByText(/已回滚到 checkpoint/)).toBeVisible();

  await page.getByRole("link", { name: /Scene/ }).click();
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
  const newStoryForm = page.locator("form").filter({ hasText: "New Storyline" });
  await newStoryForm.getByLabel("Storyline title").fill("苍白学院");
  await newStoryForm.getByLabel("Tagline").fill("钟声响起时，走廊会改写姓名。");
  await newStoryForm.getByLabel("Summary").fill("一座会记录选择的学院正在等待新的旁听生，每一次回答都会改变走廊和钟声。");
  await newStoryForm.getByLabel("Main character").fill("伊芙");
  await newStoryForm.getByLabel("Opening scene").fill("雨停在窗外，黑板上却写着你的名字。");
  await newStoryForm.getByRole("button", { name: /Save New Draft/ }).click();
  await expect(page.getByText("Draft created.")).toBeVisible();
  await expect(page.getByLabel("Prompt Preview")).toContainText("System Policy");
  await expect(page.getByLabel("Prompt Preview")).toContainText("Contract evolvria-narrative-v1.0.0");
  await expect(page.getByLabel("Prompt Preview")).not.toContainText("sk-browser-preview");
  await page.getByRole("button", { name: /Save Edits/ }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  const characterEditor = page.locator("form").filter({ hasText: "Character Editor" });
  await characterEditor.locator('input[type="file"][accept="audio/*"]').first().setInputFiles({
    name: "eve-voice-reference.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("RIFF----WAVEfmt "),
  });
  await expect(page.getByText("语音参考已导入。请在 local_ready 前确认授权。")).toBeVisible();
  await expect(characterEditor.getByText(/语音参考：伊芙 语音参考/)).toBeVisible();
  await characterEditor.getByRole("button", { name: /确认语音授权/ }).click();
  await expect(page.getByText("语音参考授权已确认。")).toBeVisible();
  await expect(characterEditor.getByText(/授权：owned/)).toBeVisible();

  const editForm = page.locator("form").filter({ hasText: "Edit Package" });
  const createdStoryId = await editForm.getByLabel("Select package").inputValue();
  await page.goto(`/storylines/${createdStoryId}`);
  await page.getByRole("button", { name: "Characters" }).click();
  await expect(page.getByText(/语音参考：伊芙 语音参考/)).toBeVisible();
  await expect(page.getByText(/授权 owned/)).toBeVisible();

  await page.goto(`/create?storyId=${createdStoryId}`);
  await page.getByRole("button", { name: "Pick Native Asset" }).click();
  await expect(page.getByText("Native media picker requires the Tauri desktop runtime or a selected file.")).toBeVisible();
  await page.getByLabel("Native asset path").fill("/tmp/evolvria-native-cover.png");
  await page.getByRole("button", { name: "Import Native Asset" }).click();
  await expect(page.getByText("Native media import requires the Tauri desktop runtime.")).toBeVisible();
  await page.getByRole("button", { name: "选择本地语音" }).click();
  await expect(page.getByText("语音文件选择器需要 Tauri 桌面运行时或已选择的文件。")).toBeVisible();

  await characterEditor.getByLabel("New character name").fill("米娅");
  await characterEditor.getByLabel("Subtitle").fill("钟楼档案管理员");
  await characterEditor.getByLabel("Role in cast").fill("见证人");
  await characterEditor.getByLabel("Goals").fill("保护档案，找回缺页");
  await characterEditor.getByLabel("Relationship seed").fill("她怀疑玩家带走了缺失的档案页。");
  await characterEditor.getByLabel("Summary").fill("她熟悉学院所有被删改过的名字，却害怕自己的记录也不可靠。");
  await characterEditor.getByLabel("Profile").fill("米娅负责维护钟楼档案室。她表面谨慎冷淡，实际上在寻找一页与自己家族有关的缺失记录。");
  await characterEditor.getByLabel("说话语气").fill("谨慎、精确，偶尔露出焦虑。");
  await characterEditor.getByRole("button", { name: /Add Character/ }).click();
  await expect(page.getByText("Character added.")).toBeVisible();
  await expect(characterEditor.locator(".field-box").filter({ hasText: "米娅" }).first()).toBeVisible();

  const scenarioEditor = page.locator("form").filter({ hasText: "Scenario Editor" });
  await scenarioEditor.getByLabel("New scenario title").fill("钟楼第二次敲响");
  await scenarioEditor.getByLabel("Summary").fill("第二个可启动入口，让玩家从钟楼档案室开始调查。");
  await scenarioEditor.getByLabel("Location").fill("钟楼档案室");
  await scenarioEditor.getByLabel("Opening prompt").fill("钟楼第二次敲响时，档案柜自己打开，露出一页写着你名字的借阅记录。");
  await scenarioEditor.getByRole("button", { name: /Add Scenario/ }).click();
  await expect(page.getByText("Scenario added.")).toBeVisible();
  await expect(page.getByText(/2\. 钟楼第二次敲响/)).toBeVisible();
  await scenarioEditor.locator(".field-box").filter({ hasText: "钟楼第二次敲响" }).getByRole("button", { name: /Preview/ }).click();
  await expect(page.getByRole("heading", { name: /苍白学院 \/ 钟楼第二次敲响/ })).toBeVisible();
  await expect(page.getByText(/档案柜自己打开/)).toBeVisible();
  await page.getByRole("link", { name: /Scene/ }).click();
  await expect(page.getByLabel("语音提示")).toContainText("已附加参考音频");
  await expect(page.getByLabel("语音提示")).toContainText("授权 owned");
  await expect(page.getByLabel("语音提示")).toContainText("暂无预览");
});

test("starts a chat with a saved persona", async ({ page }) => {
  await page.goto("/start/story_starbloom_frontier");
  await page.getByRole("button", { name: "Saved Persona" }).click();
  await expect(page.locator("form").getByLabel("Saved Persona")).toHaveValue("persona_default_traveler");
  await page.getByRole("button", { name: "Start Chat" }).click();
  await expect(page.getByText(/默认旅人 - 初次进入故事的观察者/)).toBeVisible();
});

test("archives and restores a chat without deleting it", async ({ page }) => {
  await page.goto("/start/story_starbloom_frontier");
  await page.getByRole("button", { name: "Saved Persona" }).click();
  await page.getByRole("button", { name: "Start Chat" }).click();
  await expect(page.getByRole("heading", { name: /星烬边境/ })).toBeVisible();

  await page.getByRole("button", { name: /Archive/ }).click();
  await expect(page.getByRole("heading", { name: "星烬边境" })).toBeVisible();

  await page.goto("/saves");
  await expect(page.getByRole("heading", { name: "Archived Chats" })).toBeVisible();
  await expect(page.getByText(/星烬边境 \/ 灯塔第一次熄灭/)).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("No archived chats")).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue/ })).toBeVisible();
});

test("creates and restores a workspace backup", async ({ page }) => {
  await page.goto("/saves");
  const originalName = (await page.locator(".field-box strong").first().innerText()).trim();
  await page.getByRole("button", { name: /^Backup$/ }).click();
  await expect(page.getByText(/Backup created:/)).toBeVisible();
  await expect(page.getByText("manual · backup_", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /Refresh Asset Inventory/ }).click();
  await expect(page.getByText(/Browser asset inventory uses metadata only/)).toBeVisible();
  await expect(page.getByText("2 declared assets", { exact: true })).toBeVisible();
  await expect(page.getByText(/Maintenance Plan/)).toBeVisible();
  await expect(page.getByText(/Replace placeholder asset/).first()).toBeVisible();
  await page.getByLabel("Native index query").fill("星烬");
  await page.getByRole("button", { name: /Rebuild SQLite Index/ }).click();
  await expect(page.getByText(/Native SQLite index requires the Tauri desktop runtime/)).toBeVisible();

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

  await page.getByRole("button", { name: /Restore Backup/ }).first().click();
  await expect(page.getByText(/Restored workspace from backup_/)).toBeVisible();
  await expect(page.getByText(originalName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("pre_restore · backup_", { exact: false })).toBeVisible();
});

test("duplicates a storyline into Creator Studio as a local draft", async ({ page }) => {
  await page.goto("/storylines/story_starbloom_frontier");
  await page.getByRole("button", { name: /Duplicate/ }).click();
  await expect(page).toHaveURL(/\/create\?storyId=.*duplicated=1/);
  await expect(page.getByText("Duplicated as local draft.")).toBeVisible();

  const editForm = page.locator("form").filter({ hasText: "Edit Package" });
  await expect(editForm.getByRole("textbox", { name: "Title" }).first()).toHaveValue("星烬边境 本地副本");
  await expect(page.getByText(/draft \/ draft \/ SFW/)).toBeVisible();
});

test("exports and imports a creator storyline package", async ({ page }) => {
  await page.goto("/create");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export Story Package/ }).click();
  const download = await downloadPromise;
  const packagePath = await download.path();
  expect(packagePath).toBeTruthy();
  await expect(page.getByText(/Storyline package exported/)).toBeVisible();
  await page.locator('input[accept="application/json,.json,.evolvria.json"]').setInputFiles(packagePath!);
  await expect(page.getByText("Storyline package imported as local draft.")).toBeVisible();
  const editForm = page.locator("form").filter({ hasText: "Edit Package" });
  await expect(editForm.getByRole("textbox", { name: "Title" }).first()).toHaveValue(/导入草稿/);
});

test("moves a local package to trash and restores it", async ({ page }) => {
  await page.goto("/create");
  const newStoryForm = page.locator("form").filter({ hasText: "New Storyline" });
  await newStoryForm.getByLabel("Storyline title").fill("回收站学院");
  await newStoryForm.getByLabel("Tagline").fill("误删也能找回。");
  await newStoryForm.getByLabel("Summary").fill("一个用于验证本地软删除和恢复的原创故事线，确保内容不会从工作区中直接消失。");
  await newStoryForm.getByLabel("Main character").fill("档案员");
  await newStoryForm.getByLabel("Opening scene").fill("档案柜合上之前，你看见标签仍在发光。");
  await newStoryForm.getByRole("button", { name: /Save New Draft/ }).click();
  await expect(page.getByText("Draft created.")).toBeVisible();

  const editForm = page.locator("form").filter({ hasText: "Edit Package" });
  const createdStoryId = await editForm.getByLabel("Select package").inputValue();
  await editForm.getByRole("button", { name: /Move to Trash/ }).click();
  await expect(page.getByText(/Moved package to Trash/)).toBeVisible();

  await page.goto("/library");
  await page.getByPlaceholder(/标题、角色、场景/).fill("回收站学院");
  await expect(page.getByRole("link", { name: "storyline: 回收站学院" })).not.toBeVisible();

  await page.goto(`/create?storyId=${createdStoryId}`);
  await expect(page.getByText("In Trash")).toBeVisible();
  await page.getByRole("button", { name: /Restore Package/ }).click();
  await expect(page.getByText("Package restored.")).toBeVisible();

  await page.goto("/library");
  await page.getByPlaceholder(/标题、角色、场景/).fill("回收站学院");
  await expect(page.getByRole("link", { name: "storyline: 回收站学院" })).toBeVisible();
});

test("edits version and changelog as a new local draft", async ({ page }) => {
  await page.goto("/create?storyId=story_starbloom_frontier");
  const editForm = page.locator("form").filter({ hasText: "Edit Package" });
  await editForm.getByLabel("Version").fill("0.2.0 beta");
  await editForm.getByLabel("Changelog").fill("Expanded scenario entrances.");
  await editForm.getByLabel("Tagline").fill("灯塔重新点亮，第二条航线开始回应。");
  await editForm.getByRole("button", { name: /Save Edits/ }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expect(page.getByText(/0\.2\.0-beta \/ draft \/ draft \/ SFW/)).toBeVisible();

  await page.goto("/storylines/story_starbloom_frontier");
  await page.getByRole("button", { name: "Changelog" }).click();
  await expect(page.getByText("0.2.0-beta / draft")).toBeVisible();
  await expect(page.getByText("Expanded scenario entrances.")).toBeVisible();
});

test("validates seed content as local ready", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("button", { name: /Mark local_ready/ }).click();
  await expect(page.getByText("Marked local_ready.")).toBeVisible();
});

test("edits Fate Engine rules and applies full roll visibility", async ({ page }) => {
  await page.goto("/create");
  const fateForm = page.locator("form").filter({ hasText: "Fate Engine" });
  await fateForm.getByLabel("Dice").selectOption("2d6");
  await fateForm.getByLabel("Visibility").selectOption("full");
  await fateForm.getByLabel("Standard target").fill("9");
  await fateForm.getByLabel("Attribute", { exact: true }).fill("勇气");
  await fateForm.getByLabel("Skill", { exact: true }).fill("稳态");
  await fateForm.getByLabel("Consequence label").fill("压力钟");
  await fateForm.getByLabel("Consequence description").fill("失败时推进一格危险。");
  await fateForm.getByRole("button", { name: /Save Fate Rules/ }).click();
  await expect(page.getByText("Fate Engine rules saved.")).toBeVisible();

  await page.goto("/start/story_starbloom_frontier");
  await page.getByRole("button", { name: "Saved Persona" }).click();
  await page.getByRole("button", { name: "Start Chat" }).click();
  const dungeonMindForm = page.getByRole("form", { name: "Dungeon Mind Check" });
  await dungeonMindForm.getByLabel("Fate intent").fill("我用稳态读势稳住星门。");
  await dungeonMindForm.getByLabel("Difficulty target").fill("9");
  await dungeonMindForm.getByLabel("Modifier").fill("3");
  await dungeonMindForm.getByLabel("Fate seed").fill("e2e-fate-seed");
  await dungeonMindForm.getByRole("button", { name: /Run Check/ }).click();
  const fateMessage = page.locator("article.message.fate").filter({ hasText: "我用稳态读势稳住星门" });
  await expect(fateMessage).toBeVisible();
  await expect(fateMessage).toContainText(/属性 勇气 \/ 技能 稳态/);
  await page.getByRole("button", { name: /Fate/ }).click();
  await expect(page.locator("article.message.fate").filter({ hasText: "掷骰" })).toHaveCount(2);
});

test("blocks risky creator package text from local_ready", async ({ page }) => {
  await page.goto("/create");
  const newStoryForm = page.locator("form").filter({ hasText: "New Storyline" });
  await newStoryForm.getByLabel("Storyline title").fill("镜像学院");
  await newStoryForm.getByLabel("Tagline").fill("一份危险的复刻草稿。");
  await newStoryForm.getByLabel("Summary").fill("这是一个用于验证本地审核的草稿，它提到了 ISEKAI ZERO 和 copyright 风险，不应进入 local_ready。");
  await newStoryForm.getByLabel("Main character").fill("审校员");
  await newStoryForm.getByLabel("Opening scene").fill("审校室里的红色标签亮起。");
  await newStoryForm.getByRole("button", { name: /Save New Draft/ }).click();

  await expect(page.getByText(/版权或竞品引用风险/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Mark local_ready/ })).toBeDisabled();
});

test("blocks publish submission when package contains browser-only assets", async ({ page }) => {
  await page.goto("/create");
  const newStoryForm = page.locator("form").filter({ hasText: "New Storyline" });
  await newStoryForm.getByLabel("Storyline title").fill("便携性检查故事");
  await newStoryForm.getByLabel("Tagline").fill("只有可打包资产才能进入发布队列。");
  await newStoryForm.getByLabel("Summary").fill("这是一个用于验证发布前包检查的原创故事线，包含本地浏览器临时媒体引用。");
  await newStoryForm.getByLabel("Main character").fill("包检查员");
  await newStoryForm.getByLabel("Opening scene").fill("桌上放着一份等待审核的内容包。");
  await newStoryForm.getByRole("button", { name: /Save New Draft/ }).click();
  await expect(page.getByText("Draft created.")).toBeVisible();

  const editForm = page.locator("form").filter({ hasText: "Edit Package" });
  const createdStoryId = await editForm.getByLabel("Select package").inputValue();
  await page.locator('input[type="file"][accept="image/*,audio/*,video/*"]').setInputFiles({
    name: "browser-only-cover.png",
    mimeType: "image/png",
    buffer: Buffer.from("png-placeholder"),
  });
  await expect(page.getByText("Media imported. Confirm license before local_ready.")).toBeVisible();
  await page.getByRole("button", { name: /Generate Thumbnail/ }).click();
  await expect(page.getByText(/Thumbnail generation requires an image asset imported in the Tauri desktop runtime/)).toBeVisible();
  await page.getByRole("button", { name: /Quick Confirm/ }).click();

  await page.goto("/account");
  const publishForm = page.locator("form").filter({ hasText: "Publish Simulation" });
  await publishForm.getByLabel("Storyline").selectOption(createdStoryId);
  await publishForm.getByRole("button", { name: /Submit for Review/ }).click();
  await expect(page.getByText(/Blocked by .*validation issue/)).toBeVisible();
  await expect(page.getByText(/Package verification needs attention/)).toBeVisible();
  await expect(page.getByText(/browser-only asset must be reimported/)).toBeVisible();
});

test("filters and sorts the unified local library", async ({ page }) => {
  await page.goto("/library");
  await page.getByRole("button", { name: "Scenarios" }).click();
  await page.getByPlaceholder(/标题、角色、场景/).fill("逆潮");
  await expect(page.getByText("逆潮靠岸")).toBeVisible();
  await expect(page.getByText("灯塔第一次熄灭")).not.toBeVisible();

  await page.getByPlaceholder(/标题、角色、场景/).fill("");
  await page.getByLabel("Mode").selectOption("fate");
  await expect(page.getByText("灯塔第一次熄灭")).toBeVisible();
  await expect(page.getByText("逆潮靠岸")).not.toBeVisible();

  await page.getByRole("button", { name: /Review/ }).click();
  await expect(page.getByText(/local_ready|default/)).toBeVisible();
});

test("blocks chat send when estimated cost exceeds budget", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("API Key").fill("sk-browser-preview");
  await page.getByRole("button", { name: /Save Settings/ }).click();
  await expect(page.getByText(/API key backend: browser_local_storage/)).toBeVisible();
  await page.getByRole("button", { name: /Clear API Key/ }).click();
  await expect(page.getByText(/Provider key cleared\. Backend: browser_local_storage/)).toBeVisible();
  await page.getByLabel("Max estimated cost per turn").fill("0");
  await page.getByRole("button", { name: /Save Settings/ }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.goto("/start/story_starbloom_frontier");
  await page.getByLabel("Persona name").fill("预算测试员");
  await page.getByLabel("Persona description").fill("只验证预算拦截。");
  await page.getByRole("button", { name: "Start Chat" }).click();

  await page.getByPlaceholder(/说一句话/).fill("我检查坐标片，并询问莉拉刚才听见了什么。");
  await expect(page.getByText(/exceeds per-turn limit/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send$/ })).toBeDisabled();
});

test("summarizes older chat context before continuing under input limit", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Max input tokens").fill("8000");
  await page.getByLabel("Max estimated cost per turn").fill("1");
  await page.getByRole("button", { name: /Save Settings/ }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.goto("/start/story_starbloom_frontier");
  await page.getByLabel("Persona name").fill("上下文整理员");
  await page.getByLabel("Persona description").fill("验证上下文压力下自动摘要再继续。");
  await page.getByRole("button", { name: "Start Chat" }).click();

  for (let index = 1; index <= 5; index += 1) {
    await page.getByPlaceholder(/说一句话/).fill(`第 ${index} 轮，我详细记录灯塔、坐标片、逆潮和莉拉听见的钟声，并要求继续追踪这些线索。`);
    await page.getByRole("button", { name: /^Send$/ }).click();
    await expect(page.getByText(new RegExp(`第 ${index + 1} 个节拍里`))).toBeVisible();
  }

  const chatUrl = page.url();
  await page.goto("/settings");
  await page.getByLabel("Max input tokens").fill("320");
  await page.getByLabel("Max estimated cost per turn").fill("1");
  await page.getByRole("button", { name: /Save Settings/ }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.goto(chatUrl);
  await page.getByPlaceholder(/说一句话/).fill("继续。");
  await page.getByRole("button", { name: /^Send$/ }).click();
  await expect(page.getByText(/Context summarized before generation/)).toBeVisible();
  await expect(page.getByText("1 chapters")).toBeVisible();
});

test("windows long chat messages and can load older entries", async ({ page }) => {
  await page.goto("/start/story_starbloom_frontier");
  await page.getByLabel("Persona name").fill("长聊天测试员");
  await page.getByLabel("Persona description").fill("验证长聊天窗口和全文搜索。");
  await page.getByRole("button", { name: "Start Chat" }).click();
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
  await expect(page.getByText(/Showing latest 80 of 97 messages/)).toBeVisible();
  await expect(page.getByText("古早坐标片线索只应该通过全文搜索出现。")).not.toBeVisible();
  await page.getByRole("button", { name: /Preview Page/ }).click();
  await expect(page.getByText(/Browser JSON message page preview: 80 of 97/)).toBeVisible();
  await expect(page.getByText(/Rows 18-97 \/ 97/)).toBeVisible();
  await page.getByRole("button", { name: /Older Page/ }).click();
  await expect(page.getByText(/Browser JSON message page preview: 17 of 97/)).toBeVisible();
  await expect(page.getByText(/Rows 1-17 \/ 97/)).toBeVisible();
  await page.getByPlaceholder(/搜索对白/).fill("古早坐标片");
  await expect(page.getByText("Search results: 1 message(s).")).toBeVisible();
  await expect(page.getByText("古早坐标片线索只应该通过全文搜索出现。")).toBeVisible();
  await page.getByPlaceholder(/搜索对白/).fill("");
  await page.getByRole("button", { name: /Load 17 older/ }).click();
  await expect(page.getByText("Showing all 97 messages.")).toBeVisible();
  await expect(page.locator(".message-list article").filter({ hasText: "长聊天窗口消息 0" }).first()).toBeVisible();
});

test("recovers a failed provider turn by switching to mock and retrying", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Provider").selectOption("local-http");
  await page.getByLabel("Base URL").fill("http://127.0.0.1:9/v1");
  await page.getByLabel("Model").fill("dead-local-provider");
  await page.getByRole("button", { name: /Save Settings/ }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  await page.goto("/start/story_starbloom_frontier");
  await page.getByLabel("Persona name").fill("失败恢复测试员");
  await page.getByLabel("Persona description").fill("只验证 provider 失败后的重试路径。");
  await page.getByRole("button", { name: "Start Chat" }).click();
  await page.getByPlaceholder(/说一句话/).fill("我尝试触发一次失败，然后切换到 mock。");
  await page.getByRole("button", { name: /^Send$/ }).click();

  await expect(page.getByText(/Provider failed/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Retry$/ })).toBeEnabled();
  await page.getByRole("button", { name: /Switch to mock/ }).click();
  await page.getByRole("button", { name: /Retry now/ }).click();
  await expect(page.getByText(/你可以追问、观察周围/)).toBeVisible();
});

test("exports and imports a browser workspace JSON fallback", async ({ page }) => {
  await page.goto("/saves");
  await page.getByRole("button", { name: /Verify Package/ }).click();
  await expect(page.getByText("Package check passed", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export/ }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  await expect(page.getByText("Package check passed", { exact: true })).toBeVisible();
  await expect(page.getByText(/referenced assets/)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(path!);
  await expect(page.getByText(/Imported JSON workspace as/)).toBeVisible();
  await expect(page.getByText("Package check passed", { exact: true })).toBeVisible();
});

test("opens cloud platform preview and records local moderation", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: /Account, Sync, UGC/ })).toBeVisible();
  await page.getByLabel("Display name").fill("Cloud Preview Creator");
  await page.getByLabel("Email").fill("creator@example.test");
  await page.getByLabel("Age gate").selectOption("adult");
  await page.getByRole("button", { name: /Sign In Locally/ }).click();
  await expect(page.getByText("Signed in locally as Cloud Preview Creator", { exact: true })).toBeVisible();
  await expect(page.getByText(/Permissions: sync, publish, billing, adult_content/)).toBeVisible();
  await page.getByRole("link", { name: /Open Creator Profile/ }).click();
  await expect(page.getByRole("heading", { name: /Evolvria Studio|Local Creator/ })).toBeVisible();
  await expect(page.getByText(/Profile Snapshot/)).toBeVisible();
  await page.getByRole("button", { name: /Create Local Creator Report/ }).click();
  await expect(page.getByText("Creator report added to local moderation queue.")).toBeVisible();
  await page.getByRole("link", { name: /Review Queue/ }).click();
  await page.getByLabel("Mode").selectOption({ label: "Ready for cloud sync" });
  await page.getByRole("button", { name: /Save Sync State/ }).click();
  await expect(page.getByText(/Sync settings saved locally/)).toBeVisible();
  await page.getByRole("button", { name: /Refresh Device Snapshot/ }).click();
  await expect(page.getByText("Device snapshot", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Queue Update/ }).click();
  await expect(page.getByText(/Queued a local sync operation/)).toBeVisible();
  await page.getByRole("button", { name: /Refresh Device Snapshot/ }).click();
  await expect(page.getByText(/pending 1/)).toBeVisible();
  const syncDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export Operation Log/ }).click();
  const syncDownload = await syncDownloadPromise;
  const syncLogPath = await syncDownload.path();
  expect(syncLogPath).toBeTruthy();
  await expect(page.getByText(/Exported 1 sync operation/).first()).toBeVisible();
  await page.getByLabel("Import sync operation log").setInputFiles(syncLogPath!);
  await expect(page.getByText(/Imported 0 operation\(s\), skipped 1/).first()).toBeVisible();
  await page.getByRole("button", { name: /Simulate Push/ }).click();
  await expect(page.getByText(/Simulated push acknowledged/)).toBeVisible();
  await page.getByRole("button", { name: /Disable, Keep Local/ }).click();
  await expect(page.getByText(/Private sync disabled/).first()).toBeVisible();
  await expect(page.getByText(/local_only \/ conflicts/)).toBeVisible();
  await page.getByRole("button", { name: /Create Conflict/ }).click();
  await expect(page.getByText(/title conflict/)).toBeVisible();
  await page.getByRole("button", { name: /Use Cloud/ }).click();
  await expect(page.getByText(/Conflict resolved with remote/)).toBeVisible();
  await page.getByLabel("Available earning amount").fill("12.5");
  await page.getByRole("button", { name: /Add Available Earning/ }).click();
  await expect(page.getByText(/Available earning preview added/)).toBeVisible();
  await page.getByRole("button", { name: /Request Payout Preview/ }).click();
  await expect(page.getByText(/Payout preview requested/)).toBeVisible();
  await expect(page.getByText(/requested \/ 12.5 credit/)).toBeVisible();
  await page.getByRole("button", { name: /Block & Withhold/ }).first().click();
  await expect(page.getByText(/Payout block recorded/)).toBeVisible();
  await expect(page.getByText(/blocked \/ 12.5 credit/)).toBeVisible();
  await page.getByRole("button", { name: /Add Credit Estimate/ }).click();
  await expect(page.getByText(/pending \/ chat/)).toBeVisible();
  await page.getByRole("button", { name: "Freeze" }).first().click();
  await expect(page.getByText(/Ledger freeze recorded/)).toBeVisible();
  await page.getByRole("button", { name: "Refund" }).first().click();
  await expect(page.getByText(/Ledger refund recorded/)).toBeVisible();
  await page.getByRole("button", { name: /Create Local Case/ }).click();
  await expect(page.getByText(/local cases/)).toBeVisible();
  await page.getByRole("button", { name: /Request Changes/ }).first().click();
  await expect(page.getByText(/target now needs changes/)).toBeVisible();
  await page.getByRole("button", { name: /Submit for Review/ }).click();
  await expect(page.getByText(/Submitted to local review queue/)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText(/public-ready placeholder/)).toBeVisible();
  await page.getByRole("button", { name: /Create Local Case/ }).click();
  await page.getByRole("button", { name: "Reject" }).first().click();
  await expect(page.getByText(/target is blocked from publishing/)).toBeVisible();
  await page.getByLabel("Appeal reason").fill("Creator appeal: updated source notes and requests a second review.");
  await page.getByRole("button", { name: "Appeal" }).first().click();
  await expect(page.getByText(/Appeal submitted locally/)).toBeVisible();
  await expect(page.getByText(/Appeal open: Creator appeal/)).toBeVisible();
  await page.getByRole("button", { name: /Uphold Appeal/ }).first().click();
  await expect(page.getByText(/Appeal upheld locally/)).toBeVisible();
  await expect(page.getByText(/Appeal upheld: Creator appeal/)).toBeVisible();
});

test("publishes an approved storyline into public catalog and reports it from detail", async ({ page }) => {
  await page.goto("/account");
  const publishForm = page.locator("form").filter({ hasText: "Publish Simulation" });
  await publishForm.getByLabel("Storyline").selectOption("story_starbloom_frontier");
  await publishForm.getByRole("button", { name: /Submit for Review/ }).click();
  await expect(page.getByText(/Submitted to local review queue/)).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText(/public-ready placeholder/)).toBeVisible();

  await page.goto("/library");
  await page.getByLabel("Catalog").selectOption("public");
  await page.getByPlaceholder(/标题、角色、场景/).fill("星烬");
  await expect(page.getByLabel("Public recommendations")).toContainText("星烬边境");
  await expect(page.getByRole("link", { name: "storyline: 星烬边境" }).first()).toBeVisible();
  await page.getByRole("link", { name: "storyline: 星烬边境" }).first().click();
  await page.getByRole("button", { name: "Safety" }).click();
  await page.getByLabel("Storyline report reason").fill("Public catalog report: visibility should be reviewed before recommendation.");
  await page.getByRole("button", { name: /Create Report/ }).click();
  await expect(page.getByText("Storyline report added to local moderation queue.")).toBeVisible();

  await page.goto("/account");
  await expect(page.getByText(/visibility should be reviewed/)).toBeVisible();
  await page.getByRole("button", { name: /Request Changes/ }).first().click();
  await expect(page.getByText(/target now needs changes/)).toBeVisible();

  await page.goto("/library");
  await page.getByLabel("Catalog").selectOption("public");
  await page.getByPlaceholder(/标题、角色、场景/).fill("星烬");
  await expect(page.getByRole("link", { name: "storyline: 星烬边境" })).not.toBeVisible();
});
