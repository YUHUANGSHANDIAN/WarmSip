import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { resolve } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("档案、城市优先级、本地推荐和心意保存", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: /把温暖带给 TA/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "我的", exact: true }).click();
  await page.getByRole("link", { name: "我在意的人" }).click();
  await page
    .getByRole("link", { name: "添加收礼人", exact: true })
    .first()
    .click();
  await page.getByLabel("称呼").fill("测试收礼人");
  await page.getByLabel("TA 所在的城市").fill("杭州");
  await page.getByRole("button", { name: "保存 TA 的档案" }).click();
  await expect(page.getByText("测试收礼人")).toBeVisible();
  await page.getByRole("link", { name: "为 TA 选礼" }).click();
  await expect(page.getByText("当前使用：杭州（收礼人城市）")).toBeVisible();
  await page.getByLabel("本次选择的城市").fill("成都");
  await page.getByRole("button", { name: "生成一份暖心建议" }).click();
  await expect(page.getByText("本地规则灵感", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存到心意清单" }).click();
  await page.getByRole("link", { name: "心意", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "给 测试收礼人 的心意" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "给 测试收礼人 的心意" }),
  ).toBeVisible();
  await page.goto("/#/history");
  await expect(page.getByText(/日常关心 · 成都/)).toBeVisible();
});

test("设置页核对服务端 DeepSeek、高德和真实调用状态", async ({ page }) => {
  const detail = (source: string) => ({
    configured: true,
    source,
    lastSuccessAt: 1_790_000_000_000,
    lastCheckedAt: 1_790_000_000_000,
    lastErrorCode: "",
  });
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:1421",
  };
  await page.route("https://service.example.test/healthz", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({ ok: true, version: "0.2.0-beta.4" }),
    }),
  );
  await page.route(
    "https://service.example.test/api/v1/capabilities",
    (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            ...cors,
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "Authorization, Content-Type",
          },
        });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: cors,
        body: JSON.stringify({
          ai: true,
          places: true,
          weather: true,
          map: true,
          mapJsKey: "test-public-key",
          mapProxyUrl: "/api/v1/map-proxy/test",
          details: {
            ai: detail("DeepSeek · 服务端环境"),
            places: detail("高德 Web 服务"),
            weather: detail("高德天气"),
            map: detail("高德 JS API"),
          },
        }),
      });
    },
  );
  await page.route("https://service.example.test/api/v1/ai/state", (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Authorization, Content-Type",
        },
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({
        available: true,
        credentialManagementReady: false,
        persistence: "process-memory",
        connections: [
          {
            id: "deepseek-env",
            providerId: "deepseek",
            origin: "environment",
            managedByService: true,
            label: "DeepSeek · 服务端环境",
            authType: "api-key",
            baseUrl: "https://api.deepseek.com",
            enabled: true,
            status: "connected",
            maskedCredential: "由服务端环境管理",
            modelCount: 1,
            modelIds: ["deepseek-flash"],
            lastCheckedAt: 1_790_000_000_000,
            lastError: "",
            createdAt: 1_790_000_000_000,
            updatedAt: 1_790_000_000_000,
          },
        ],
        models: [
          {
            providerId: "deepseek",
            id: "deepseek-flash",
            name: "DeepSeek V4.1 Flash",
            input: ["text"],
            reasoning: true,
          },
        ],
        routes: [
          {
            taskId: "gift",
            connectionId: "deepseek-env",
            modelId: "deepseek-flash",
          },
        ],
        usage: {
          todayCalls: 1,
          monthCalls: 1,
          todayCostUsd: 0.0001,
          monthCostUsd: 0.0001,
          recent: [],
        },
        privacy: {
          singleTenant: true,
          message: "单可信管理域",
        },
      }),
    });
  });
  await page.goto("/#/settings");
  await page.getByLabel("服务地址").fill("https://service.example.test");
  await page.getByLabel("服务访问令牌").fill("test-access-token-1234567890");
  await page.getByRole("button", { name: "保存并检查连接" }).click();
  await expect(page.getByText(/DeepSeek AI：最近调用成功/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "DeepSeek · 服务端环境" }),
  ).toBeVisible();
  await expect(page.getByText(/服务端环境 · 只读/)).toBeVisible();
  await expect(page.getByText(/本次服务进程内保留/)).toBeVisible();
});

async function createMap(page: Page, title: string) {
  await page.goto("/#/maps/new");
  await page.getByLabel("地图名称").fill(title);
  await page.getByRole("button", { name: "创建暖迹图" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  return page.url();
}

async function addPlace(page: Page, name: string) {
  await page
    .getByRole("link", { name: "添加地点", exact: true })
    .first()
    .click();
  await page.getByLabel("地点名称").fill(name);
  await page.getByLabel("所在城市").fill("杭州");
  await page.getByLabel("当前状态").selectOption("visited");
  await page.getByLabel("属于这个地点的小故事").fill("只有自己知道的私人备注");
  await page
    .getByLabel("添加照片", { exact: true })
    .setInputFiles(resolve("public/brand/icon-192.png"));
  await expect(page.getByRole("button", { name: "移除此照片" })).toHaveCount(1);
  await page.getByRole("button", { name: "保存地点与故事" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function prepareScreenshot(page: Page) {
  const close = page.getByRole("button", { name: "关闭提示", exact: true });
  if (await close.isVisible()) await close.click();
  await page.locator("main").focus();
  await page.evaluate(() => window.scrollTo(0, 0));
}

test("多地图隔离、照片打卡、隐私分享与删除撤销", async ({ page }, info) => {
  const first = await createMap(page, "周末的小小暖迹");
  await addPlace(page, "午后的窗边");
  await expect(page.getByText("待定位", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "分享暖迹", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("input:checked")).toHaveCount(0);
  await expect(dialog.locator(".share-preview")).not.toContainText(
    "只有自己知道",
  );
  await page.getByLabel("加入私人备注").check();
  await expect(dialog.locator(".share-preview")).toContainText("只有自己知道");
  await page.keyboard.press("Escape");
  await prepareScreenshot(page);
  await page.screenshot({
    path: info.outputPath(`map-${info.project.name}.png`),
    fullPage: false,
  });
  const second = await createMap(page, "下一次出发");
  await expect(page.getByRole("heading", { name: "午后的窗边" })).toHaveCount(
    0,
  );
  await page.goto(first);
  await page.getByRole("link", { name: "详情 / 编辑" }).click();
  await expect(page.getByRole("button", { name: "移除此照片" })).toHaveCount(1);
  await page.getByRole("button", { name: "删除地点", exact: true }).click();
  await page.getByRole("button", { name: "移入回收站", exact: true }).click();
  await expect(page.getByRole("heading", { name: "午后的窗边" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByRole("heading", { name: "午后的窗边" })).toBeVisible();
  await page.getByRole("button", { name: "地图更多操作" }).click();
  await page.getByRole("button", { name: "删除地图", exact: true }).click();
  await page.getByRole("button", { name: "移入回收站", exact: true }).click();
  await expect(page).toHaveURL(/\/#\/maps$/);
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "恢复", exact: true }).first().click();
  await page.goto(first);
  await expect(page.getByRole("heading", { name: "午后的窗边" })).toBeVisible();
  await page.goto(second);
  await expect(page.getByRole("heading", { name: "午后的窗边" })).toHaveCount(
    0,
  );
});

test("含照片 ZIP 备份在全新浏览器存储中恢复且重复导入跳过", async ({
  page,
  browser,
}, info) => {
  await createMap(page, "备份里的暖迹");
  await addPlace(page, "留下的小瞬间");
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "导出完整备份", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "导出完整备份", exact: true })
    .click();
  const file = info.outputPath("backup.zip");
  await (await downloadPromise).saveAs(file);
  const context = await browser.newContext();
  const restored = await context.newPage();
  try {
    await restored.goto("http://127.0.0.1:1421/#/settings");
    await restored.getByLabel("选择备份文件").setInputFiles(file);
    await restored
      .getByRole("button", { name: "确认导入", exact: true })
      .click();
    await expect(restored.getByRole("status")).toContainText("已导入 2 条");
    await restored.getByLabel("选择备份文件").setInputFiles(file);
    await restored
      .getByRole("button", { name: "确认导入", exact: true })
      .click();
    await expect(restored.getByRole("status")).toContainText("跳过 2 条重复");
    await restored.goto("http://127.0.0.1:1421/#/maps");
    await restored
      .getByRole("link")
      .filter({ has: restored.getByRole("heading", { name: "备份里的暖迹" }) })
      .click();
    await restored.getByRole("link", { name: "详情 / 编辑" }).click();
    await expect(
      restored.getByRole("button", { name: "移除此照片" }),
    ).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("胶囊按所选时区开启并保留内容", async ({ page }) => {
  await page.goto("/#/capsules/new");
  await page.getByLabel("胶囊标题").fill("今天的小约定");
  await page.getByLabel("想留给未来的话").fill("记得给自己一杯温暖。");
  await page.getByLabel("开启日期", { exact: true }).fill("2020-01-01");
  await page.getByLabel("开启时区").fill("America/New_York");
  await page.getByRole("button", { name: "保存时间胶囊" }).click();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: "今天的小约定" }) })
    .click();
  await page.getByRole("button", { name: "开启时间胶囊", exact: true }).click();
  await expect(page.getByText("记得给自己一杯温暖。")).toBeVisible();
  await page.reload();
  await expect(page.getByText("记得给自己一杯温暖。")).toBeVisible();
});

test("PWA 离线重启仍能编辑本地地点", async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await createMap(page, "离线也记得");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/当前离线/)).toBeVisible();
  await addPlace(page, "无需联网的回忆");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "无需联网的回忆" }),
  ).toBeVisible();
});

test("关键页面明暗主题无障碍与移动布局", async ({ page }, info) => {
  for (const theme of ["light", "dark"]) {
    await page.goto("/#/settings");
    await page
      .getByRole("button", {
        name: theme === "light" ? "明亮" : "深色",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    for (const route of [
      "/",
      "/maps",
      "/profiles/new",
      "/gifts",
      "/settings",
    ]) {
      await page.goto(`/#${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            html: n.html,
            reason: n.failureSummary,
          })),
        })),
        `${theme} ${route}`,
      ).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      ).toBe(true);
      if (route === "/") {
        await prepareScreenshot(page);
        await page.screenshot({
          path: info.outputPath(`home-${theme}-${info.project.name}.png`),
          fullPage: false,
        });
      }
    }
  }
});

test("关键页面在六档宽度没有横向溢出或标题挤压", async ({ page }) => {
  for (const width of [360, 390, 430, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 900 ? 844 : 1000 });
    for (const route of [
      "/",
      "/maps",
      "/gifts",
      "/profiles",
      "/orders",
      "/settings",
    ]) {
      await page.goto(`/#${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `${width}px ${route}`,
      ).toBe(true);
    }
  }
});
