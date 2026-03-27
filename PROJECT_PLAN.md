# Guess the Price AU（澳洲拍卖房竞猜）— 项目计划（唯一迭代文档）

> **文档规则（强制）**：本项目的计划/里程碑/进度/变更/决策/待办/风险 **只维护这一份文档**：`PROJECT_PLAN.md`。  
> 任何新增内容一律写回本文件对应章节，禁止创建其他计划类文档。

---

## 0. 项目概述

### 0.1 一句话定位
一个大众参与的、娱乐属性的「澳洲房产拍卖结果竞猜」网站：用户对每套拍卖房源做两项预测，并在拍卖结束后查看全站统计与个人战绩，适合社交媒体传播。

### 0.2 非目标（明确不做）
- 不做官方服务平台、不做估价工具、不提供投资建议/金融建议。
- 不承诺数据完整性与实时性（公开网页抓取/手工补录均可能缺失）。

### 0.3 目标用户与使用场景
- **用户**：关注澳洲房市/拍卖、喜欢参与互动投票/竞猜、社交媒体重度用户（中英双语）。
- **场景**：
  - 分享一套“看起来很有趣”的房源卡片到社交媒体 → 朋友来投票
  - 拍卖结束后回看“我猜中了没”与“大家怎么猜”

---

## 1. 产品形态与核心玩法

### 1.1 核心玩法（每套房只有两题）
对每条拍卖房源，用户可以提交一份预测：
- **Q1**：是否会在拍卖前或拍卖中成功售出？
  - 选项：`Sold`（售出）/ `Passed in`（流拍/未成交）
- **Q2**：如果售出，成交价是多少？
  - 输入：数字（AUD），间隔是每1w澳元
  - 可选增强（后续）：区间选择（降低输入门槛，统计更稳定）

### 1.2 结果展示
- 单房源（核心）：Q1 投票占比、Q2 价格分布（中位数/分位数/直方图）
- 其他第二阶段补充：
- 全站：今日/本周热门房源、榜单（预测最准、参与最多、连胜）
- 个人：历史预测、命中率、与大众偏差（你更“看涨/看跌”）

### 1.3 传播设计（第二阶段MVP）
- 房源分享卡片（OG Image）：封面图 + “你觉得成交价多少？” + 二维码/短链


## 2. 设计方向（清爽卡通）

### 2.1 UI 复用策略（不重复造轮子）
优先基于 GitHub 现成的娱乐化/游戏化 UI 模板改造，目标风格为**清爽、圆润、卡通感**，并且**从第一天起按移动端 App 形态来设计**（底部 Tab、顶部导航、页面转场、手势友好）。

推荐优先级（按“像 App”程度 + 改造速度综合排序）：
- **A. 最像原生 App（首推）**：Ionic + Next.js + Tailwind + Capacitor
  - `https://github.com/mlynch/nextjs-tailwind-ionic-capacitor-starter`
  - Next.js 14 的 TypeScript 变体（fork）：`https://github.com/UretzkyZvi/nextjs-typescript-tailwind-ionic-starter`
- **B. 清爽卡通、改造极快（备选）**：Next.js + Tailwind + daisyUI（Quiz 流程改造成两题投票）
  - `https://github.com/zougari47/quizify`
- **C. 纯 Web App 味（备选）**：Framework7（iOS/Android 视觉与导航范式非常“App”）
  - Next.js starter：`https://github.com/framework7io/framework7-nextjs-starter`
- **D. Tailwind 下的移动端组件库（可叠加到 B 或 A）**：Konsta UI（iOS/Material 组件）
  - 组件库：`https://github.com/konstaui/konsta`
  - Next.js 模板：`https://github.com/abigoroth/react-konsta-nextjs-template`

投票 UI 形态参考（不一定当基底）：
- `https://github.com/omarxkhalid/nextvote`

### 2.2 品牌与视觉（后续可迭代）
- 颜色：浅色系为主，搭配 1 个高饱和强调色（按钮/高亮）
- 字体：中英兼容（Google Fonts + 常见中文回退）
- 插画：尽量用轻量 SVG/贴纸风（可先占位）

### 2.3 移动端 App 化布局约束（强制）
- 全站采用“App Shell”结构：底部 Tab（如：发现/竞猜/榜单/我的），页面内容在 Shell 内切换
- 交互优先触控：按钮尺寸、间距、滑动区域与手势友好
- 列表页以卡片为主，详情页信息分段（类似 App 的 section）
- 图片与卡片动效（轻量）：用于“娱乐感”与传播

---

## 3. 技术方案（短平快 + 未来可打包 App）

### 3.1 技术选型
- **前端/全栈**：Next.js（App Router）+ TypeScript
- **UI（移动端优先）**：优先 Ionic（最像 App）；备选 Tailwind + daisyUI（上手快）+ Konsta UI（移动端组件）
- **Auth**：优先 Supabase Auth（Google/Facebook），后续可加 Apple
- **DB**：Supabase Postgres（投票统计友好）
- **App 打包**：Capacitor（未来），参考：`https://github.com/mlynch/nextjs-tailwind-ionic-capacitor-starter`

### 3.2 登录渠道策略（MVP）
- **MVP 必做**：Google、Facebook
- **延后**：小红书 OAuth（可能涉及主体资质/场景限制，先不阻塞 MVP）

### 3.3 数据获取（爬取）策略
分阶段降低风险：
- **阶段 A（最快上线）**：手工录入 10–30 条房源（链接 + 图片 + 拍卖时间）
- **阶段 B（半自动）**：CSV/后台表单导入
- **阶段 C（自动抓取）**：对 realestate / domain 的公开列表页抓取 auction 相关条目（需关注 ToS 与稳定性）

---

## 4. 数据模型（MVP 版）

### 4.1 表结构（概念，核心数据）
- `listings`
  - `id`
  - `source`（domain / realestate / manual）
  - `source_url`
  - `title`（简短地址/标题）
  - `address`
  - `coordinates`
  - `suburb`, `state`, `postcode`
  - `auction_at`（拍卖时间）
  - `cover_image_url`
  - `status`（状态，waiting for auction, sold before auction, sold at auction, auction cancelled）
  - `sold_price_aud`（number | null）
  - `updated_at`
- `votes`
  - `id`
  - `listing_id`
  - `user_id`
  - `will_sell`（boolean）
  - `sold_price_aud`（number | null）
  - `created_at`, `updated_at`
  

### 4.2 统计指标（MVP,留到第二阶段再开发）
- 每房源：
  - `will_sell_yes_ratio`
- 每用户：
  - `q1_accuracy`
 

---

## 5. 功能范围（按优先级）

### 5.1 P0（必须上线）
- 房源列表页（卡片）
- 房源详情页（两题竞猜 + 当前统计）
- 登录（Google）
- 提交/更新投票（拍卖开始前允许修改）
- 结果展示（最基础：占比 + 中位数）
- 免责声明与使用条款页面（基础版）

### 5.2 P1（提升传播与留存）
- Facebook 登录
- 分享卡片（OG Image）+ 短链
- 排行榜（最准、参与最多）
- 双语（中/英）

### 5.3 P2（数据自动化与运营）
- 半自动导入（CSV/后台表单）
- 爬虫 v1（单站点起步）
- 管理后台（录入/校验拍卖结果）

---

## 6. 里程碑与排期（可滚动调整）

> 说明：日期会在执行中根据阻塞项滚动更新；所有变更记录写入「11. 变更记录」。

### 里程碑 M0：项目起步（目标：3–5 天）
- [x] 选定 UI 基底仓库并跑通本地
- [x] Next.js 项目初始化、基础路由（位于 `apps/web`）
- [ ] 主题与视觉基线（清爽卡通）
- [ ] 10 条房源手工数据跑通展示

### 里程碑 M1：MVP 可分享（目标：1–2 周）
- [ ] Google 登录
- [ ] 投票写入 DB（每人每房源一票，可更新）
- [ ] 单房源统计展示（Q1 占比、Q2 中位数/分布）
- [ ] 基础分享（复制链接 + OG 图占位）

### 里程碑 M2：增长版本（目标：第 3–4 周）
- [ ] Facebook 登录
- [ ] 排行榜/个人战绩
- [ ] 双语
- [ ] 分享卡片完善（可用于社交媒体）

### 里程碑 M3：数据自动化（目标：第 5 周起）
- [ ] 导入工具（CSV/后台）
- [ ] 爬虫 v1（domain/realestate 选其一先做）
- [ ] 结果校验与告警（防止脏数据）

---

## 7. 任务看板（单文件迭代）

> 使用约定：  
> - 新任务只加到这里，不要新建其他 TODO 文档  
> - 状态只用：`Backlog` / `Doing` / `Blocked` / `Done`  
> - 每周至少更新一次

### Backlog
- [ ] 定义房源卡片信息层级（标题、拍卖时间、来源、热度）
- [ ] 统计图表方案（Chart.js/Recharts）
- [ ] OG Image 生成方案（Next.js route handler）
- [ ] 结果录入方式（最简后台 or 受保护接口）

### Doing
- [x] 将 App Shell 的 Tab 结构调整为：发现/竞猜/榜单/我的（先做空页面占位）
- [ ] 引入基础品牌主题（清爽卡通配色 + 字体）
- [ ] Supabase：初始化项目与建表（listings/votes/outcomes），并完成 Auth 控制台配置（Google Provider）
- [ ] 打通最短链路：登录 → 为单个房源投票 → 统计页显示聚合结果（先用 1 条手工房源）
- [ ] Google / Facebook OAuth：配置 Redirect URLs（本地与线上），并验证回调路由 `/auth/callback` 可正常登录
- [ ] 执行 `supabase/migration_listing_invite.sql`（realestate_id / domain_id / suggest_price / created_by + RPC + RLS）

### Blocked
- [ ] 小红书登录可行性与资质（Phase 2）
- [ ] 爬虫 ToS 风险评估与降级方案

### Done
- [x] 初始化 `apps/web`（Next.js + Ionic + Tailwind + Capacitor）并成功启动本地开发环境
- [x] App Shell：底部 Tab 改为「发现/竞猜/榜单/我的」并创建页面占位（移动端 App 化信息架构落地）
- [x] Supabase 客户端与 Google 登录 UI 骨架（我的页）已接入（待填 `.env.local` 与控制台配置）
- [x] 发现页：从 Supabase 读取 `listings` 并渲染卡片，进入 `/guess?listingId=...`
- [x] 竞猜页：读取房源、投票 upsert、以及当前统计（Q1 占比 + Q2 中位数，MVP 轮询）
 - [x] OAuth 回调路由：新增 `/auth/callback`（适配静态导出），并接入到 Ionic Router
- [x] 发现页右上角「发起竞猜」：粘贴 realestate/domain 链接 → API 查重（外部 ID / 地址）→ 抓取并新建 listing → 跳转竞猜页
- [x] Next 构建策略：`next build` 保留 `app/api`；`npm run build:cap`（Capacitor）临时移走 `app/api` 后静态导出
- [x] 登录入口补全：在「我的」页新增 Facebook 登录（与 Google 共用 Supabase OAuth 回调）
- [x] 竞猜页统计 UI：Recharts 环形图（售出/流拍占比）+ 横向条形图（价格区间 × 票数占比），清爽卡通渐变卡片样式
- [x] 「我的」→「我的竞猜」：个人投票列表 + 房源 `sold_price` / `sold_at` 展示

---

## 8. 关键决策（ADR，必须写在这里）

> 任何“选型/架构/策略”的结论都写这里，便于回溯。

- **ADR-001（待定）**：Auth/DB 采用 Supabase 作为 MVP 后端
- **ADR-002（待定）**：UI 基底采用 Ionic + Next.js + Tailwind + Capacitor（最像原生 App 的导航与底部 Tab）
- **ADR-003（待定）**：MVP 阶段不做小红书 OAuth，优先 Google/Facebook
- **ADR-004（待定）**：若 Ionic 改造成本过高，则降级为 `quizify`（daisyUI）并叠加 Konsta UI 的移动端组件

---

## 9. 风险与对策

- **爬虫稳定性**：页面结构变化/反爬 → 先手工/导入；抓取模块与主站解耦
- **合规与免责声明**：避免“估价/建议”措辞 → 首页与投票页显著声明
- **社交登录审核**：部分平台要求企业主体 → MVP 先上 Google/Facebook

---

## 10. 质量标准（MVP 也要守）
- 移动端优先（竖屏体验）
- 首屏加载快（图片懒加载、压缩）
- 关键路径可用：打开→登录→投票→看统计→分享

---

## 11. 变更记录（Changelog）

> 每次范围/排期/选型变化都在这里记一条（日期 + 内容 + 原因）。

- **2026-03-18**：创建唯一项目计划文档；明确清爽卡通 UI 倾向；列出可复用 GitHub 模板与 Next.js→Capacitor 路径。
- **2026-03-18**：补充“移动端 App 化布局约束（强制）”；UI 推荐升级为 Ionic/Framework7/Konsta 等更像 App 的基底与组件库。
- **2026-03-18**：落地代码骨架：使用 `mlynch/nextjs-tailwind-ionic-capacitor-starter` 初始化到 `apps/web`，本地 `npm run dev` 可运行。
- **2026-03-19**：发起竞猜（粘贴链接查重+抓取+入库）；listings 增加 `realestate_id`/`domain_id`/`suggest_price`/`created_by`；Cap 构建脚本规避 API 与 export 冲突。
- **2026-03-19**：仓库根目录增加 `package.json`，`npm run dev` / `dev:clean` 等自动转发到 `apps/web`。
- **2026-03-18**：竞猜页「已投票」统计区升级为图表：依赖 `recharts`；价格分布为直方图分箱（`lib/guessPriceHistogram.ts`），纵轴为价格区间、横轴为该区间的票数占全部有效出价的比例。
- **2026-03-18**：竞猜提交规则：必须同时完成 Q1 与 Q2（成交价须为合法整数「万澳元」）才可点击提交，避免仅选 Q1 即提交。
- **2026-03-20**：「我的」页新增「我的竞猜」子页 `/me/guesses`：列表展示个人投票记录、预测价、房源 `sold_price` / `sold_at`（空则显示 `-`）；`schema.sql` 补充 `listings.sold_price` / `sold_at` 字段说明。
- **2026-03-20**：「我的」页新增 `Privacy` 与 `Terms` 快速入口，便于用户随时查看政策页。
- **2026-03-20**：`/api/listings/from-url` 修复 realestate 抓取 `HTTP 429`：新增多策略抓取链路（直连重试失败后改走只读镜像抓取），不再使用最小记录降级。
- **2026-03-20**：抓取链路接入 Bright Data：支持 `BRIGHTDATA_API_KEY` + `BRIGHTDATA_ZONE`，并在 realestate `HTTP 429` 场景输出更明确的 zone 配置错误信息。
- **2026-03-20**：`.env.local.example` 补充说明：`BRIGHTDATA_ZONE` 须为 **Web Unlocker** zone（如 `web_unlocker1`），与 **Residential** zone（如 `residential_proxy1`）不可混用。
- **2026-03-20**：realestate 经 Unlocker 需 **Premium domains** 时，抓取链路增加 **Residential superproxy**（`BRIGHTDATA_RESI_*` / `BRIGHTDATA_RESI_PROXY_URL`）作为后备。
- **2026-03-20**：Bright Data Unlocker：对 realestate.com.au 等须在 `/request` body 中传 **`country: au`**，否则 API 可能误报「Premium permissions」；代码已对 realestate/domain 默认附带 `country: au`。
- **2026-03-20**：新增 `debugDumpListingPage` + `scripts/dump-listing-page.ts`：输出 meta / JSON-LD / `__NEXT_DATA__` 探针等；实测 Bright Data 返回的 HTML 可能**不含** `__NEXT_DATA__`（坐标等或仅在整页/客户端）。
- **2026-03-20**：`/api/listings/from-url` 的抓取改为「Unlocker + Mapbox geocode」单链路：若 HTML 解析不到 `latitude/longitude`，则使用 `MAPBOX_TOKEN` 对已提取地址做一次 Mapbox Geocoding 补齐经纬度，避免再跑第二个抓取流程。
- **2026-03-20**：修复 realestate 抓取字段缺失：当 `__NEXT_DATA__` 不可用时，新增从地址文本推导 `suburb/state/postcode` 的兜底解析，确保这三项可入库显示。
- **2026-03-20**：继续修复 realestate 的 `suburb` 漏写：新增 JSON-LD `PostalAddress` 提取（`addressLocality/addressRegion/postalCode`）并修正地址文本解析的尾逗号场景，确保 `suburb` 可稳定写入数据库。
- **2026-03-20**：Discover 推荐流改造：前端 localStorage 记录最近看过 3 条房源（点进 Guess 即记为已看），后端新增 `/api/listings/recommendations` 按 `suburb+postcode` 推荐 3 条并支持 `More` 续取；无历史时返回随机 3 条。
- **2026-03-20**：Discover 新增顶部搜索框（类 realestate 样式）：支持按 `suburb` 模糊搜索或 `postcode` 搜索，且仅返回 `status = upcoming` 房源；搜索命中后在列表中展示全部匹配结果。
- **2026-03-20**：Discover 新增 `Show Surronding Suburbs`：以当前列表首个带坐标房源为中心，按 10km 半径筛选 `upcoming` 房源并按 suburb 去重，作为新 section 展示在主列表下方。
- **2026-03-20**：导航与入口调整：底部 Tab 移除「我的」，在 Discover 顶部右侧新增「我的」图标入口；同时把 `Start New Guess` 文本按钮替换为新建竞猜图标按钮。
- **2026-03-20**：「我的」页：`My Predictions` 增加前置图标；Settings 区增加标题与齿轮图标；列表改为无分割线、无底部边框样式。
- **2026-03-20**：「我的」页：`My Predictions` 与 `Settings` 使用统一 `SectionHeading` 组件，标题左对齐、图标与字号一致。
- **2026-03-20**：「我的」页：OAuth 头像从 `user_metadata.picture` / `avatar_url` 读取并展示；用户信息区增加 `margin` 偏移；头像 `<img>` 使用 `referrerPolicy="no-referrer"` 兼容 Google 图片域名。
- **2026-03-20**：「我的」页改为右侧抽屉式浮层：占视口宽度 80%，左侧 20% 半透明遮罩点击关闭；支持滑入动画与 body 滚动锁定；工具栏增加关闭按钮。
- **2026-03-20**：`Privacy` / `Terms` 页面工具栏左侧增加 `IonBackButton`（默认返回 `/me`，仅图标展示）。
- **2026-03-20**：竞猜页（`Guess`）底部增加「Auction Result」区块：展示 `sold_price` / `sold_at`；`sold_price` 为空时显示 `to be updated`。
- **2026-03-20**：竞猜页房源卡片：窄屏上图下文、宽屏（`md+`）左图右文；标题与拍卖时间左对齐；拍卖时间下增加「open in Realestate / open in Domain」外链（`realestate_id` / `domain_id`，优先 `source_url`）。
- **2026-03-20**：新增 `Search` 页面（复制自 Discover）：`Tabs` 增加路由 `/search` 与底部「搜索」Tab（`searchOutline`）；`Search.tsx` 使用独立 localStorage 键 `gtp_recent_viewed_listings_v1_search`，避免与发现页「最近浏览」互相覆盖。
- **2026-03-20**：`Search` 页精简：移除顶部 Profile / Start new guess 与粘贴链接竞猜；移除「猜你喜欢」推荐、`/api/listings/recommendations` 与 More；不再使用「最近浏览」localStorage；搜索栏置于 `IonHeader` 第二行工具栏以随壳层固定；保留 suburb/postcode 搜索与 Surrounding Suburbs（按钮文案修正为 Surrounding）。
- **2026-03-20**：`Search` 页搜索栏下增加 `IonSegment`：`Future auctions`（`status = upcoming`）与 `Recent auctions`（`status != upcoming`），默认 Future；切换时在已有搜索词下自动重搜；Surrounding Suburbs 与当前时间筛选一致。
- **2026-03-20**：`Search` 页 Future/Recent 筛选由 `IonSegment` 改为原生 `radio` + `fieldset`/`label`，语义更清晰、一眼可见单选。
- **2026-03-20**：`Discover` 页搜索条改为仅样式入口：点击跳转 `/search?focusSearch=1`，`Search` 页 `useEffect` 聚焦搜索框并 `replace` 去掉 query；移除 Discover 内 suburb/postcode 搜索与 Show Surrounding Suburbs；保留 Profile、Start new guess 与「Auctions you might be interested in」推荐流。
- **2026-03-20**：`Discover` 工具栏放大「新建竞猜」与「我的」图标；已登录且 OAuth 有头像时「我的」显示用户头像（逻辑抽至 `lib/oauthAvatar.ts`，`Me` 页复用）。
- **2026-03-23**：`Discover` 工具栏：`IonIcon` 与头像统一为 `h-9 w-9` 占位并用 `[&_ion-icon]:h-9 [&_ion-icon]:w-9` 约束矢量图标外框，与圆形头像同大。
- **2026-03-23**：`Search` 页：Future = `status=upcoming` 且 `auction_at` 晚于当前时刻；Recent = 其余（PostgREST `or` 组合）；列表与 Surrounding 查询同步；`Listing` 增加 `status/sold_price/sold_at`；仅 `isFutureAuctionListing` 显示 GUESS，否则展示字段或「result to be updated」；筛选区改为居中双卡片 + 选中 ring。
- **2026-03-23**：`Search` 顶栏去掉标题，改为 `IonBackButton`（默认回 `/discover`）；Future/Recent 单选行 `mx-auto` + `justify-between` 横向分布。
- **2026-03-23**：`Search` 页统一水平边距：常量 `SEARCH_PAGE_GUTTER`（`px-4`）用于各 `IonToolbar` 与正文外层；`IonContent` 取消默认 ion-padding 后内层 `px-4`；列表/按钮/分区使用 `gap-4` / `gap-5`；`IonCard` `m-0 w-full`；顶栏底部分割线。
- **2026-03-23**：`Search` 修复：`IonContent` 去掉错误的 `--padding-top:0`（避免首条 listing 被固定顶栏遮挡）；正文内层 `pt-6` 与顶栏留白。
- **2026-03-23**：`Search` Future/Recent 单选去掉选中态 `ring` 绿色描边，仅保留原生 radio 与文案。
- **2026-03-23**：`/api/listings/recommendations`（Discover「猜你喜欢」）与 Search「Future auctions」一致：仅 `status=upcoming` 且 `auction_at` 晚于当前时刻且 `auction_at` 非空；上下文推荐与随机推荐两路查询均套用。
- **2026-03-23**：Domain 抓取 `auction_at`：`parseListingHtml` 对 `domain` 走 `extractDomainAuctionAt`（HTML 正则仅锚定 `###/## Auction` 或 `Auction On Site`，**不再**以「Inspection & Auction times」起算以免先命中 Inspection；`h*`「Auction」后兄弟节点；JSON-LD 仅 `auctionDate`；`__NEXT_DATA__`：`inspection.auctionTime.openingDateTime`（ISO 字符串）与 `auctionDetails.auctionSchedule.openingDateTime`（`isoDate`），并保留同对象 `auctionDate`+`auctionTime` 字符串合并；禁用 Domain 下泛 `startDate` 等误作拍卖）。参考：[domain.com.au 示例房源](https://www.domain.com.au/43-fairmont-avenue-norwest-nsw-2153-2020658983)。
- **2026-03-23**：新增 **Feed** 页（`/feed`）：底部 Tab「Feed」；数据来自 `votes` 按 `updated_at` 降序最多 10 条，嵌套 `listings`；`GET /api/feed` 用 anon 读投票，可选 `SUPABASE_SERVICE_ROLE_KEY` 服务端拉昵称/头像；UI 为浅灰背景 + 白卡片信息流。`schema.sql` 增加 `votes_updated_at_desc_idx`（可选执行）。
- **2026-03-23**：`Guess` 顶栏：去掉「Quiz」标题，改为左侧 `IonBackButton`（默认 `/discover`）；右侧增加分享图标按钮（复用 `shareListing` / Web Share API）。
- **2026-03-23**：`Guess` 顶栏分享图标：`@fortawesome/react-fontawesome` + `@fortawesome/free-solid-svg-icons` 的 `faShare`（与 `fa-solid fa-share` 一致），替代 Ionicons `shareOutline`。
- **2026-03-23**：`Guess` 页：问卷仅在 `status === 'upcoming'` 且当前时刻早于 `auction_at` 时展示；`Auction Result` 在 `status !== 'upcoming'` 或当前时刻 ≥ `auction_at` 时展示；拉取 `listings.status`；30s 刷新 `now` 以跨拍卖时刻切换 UI；投票窗口外未投票用户直接看 Statistics。
- **2026-03-23**：`Guess` Q1：`IonSegment` 改为 `fieldset` + 原生 `radio`（与 `Search` 筛选样式一致，`accent-emerald-600`）。
- **2026-03-23**：`Guess` Q1 默认选项设为 `YES`（`sold`），减少用户首步点击成本。
- **2026-03-23**：`Guess` Q1 文案改为动态日期：`Will this property be sold by end of [targetDate] ?`；优先用 `auction_at` 日期（不含时间），若为空则用 `created_at + 4 weeks`。
- **2026-03-23**：新增复用组件 `components/ui/AsyncStates.tsx`：`LoadingStateCard`（三点弹跳 + skeleton）与 `EmptyStateCard`（简约插画风空态）；已替换 `Discover` / `Search` 页的纯文本 `Loading...` 与 `No listings / No matching listings`。
- **2026-03-23**：实现分享快照 MVP（方案 A，前端本地生成）：`Guess` 页接入 `html-to-image`，新增 `Generate Snapshot` 按钮与离屏海报模板（1080 宽）；一键导出 PNG 到本地，便于小红书等“发图”分享。
- **2026-03-23**：快照导出跨域修复：新增 `/api/image-proxy` 同源图片代理（白名单域名），快照模板改用代理 URL，解决 Domain 图片 307 + CORS 导致的导出失败。
- **2026-03-23**：快照主图稳定性增强：图片代理白名单补充 `rimh2.domainstatic.com.au`；导出前预加载快照图，加载失败时自动切换为无图海报兜底，避免整张快照失败。
- **2026-03-23**：快照内容与页面状态对齐：投票前快照显示 Quiz（Q1/Q2 当前输入）；投票后或结果阶段快照显示 Statistics（YES/NO 占比、中位预测价）并在可用时附带 Auction Result。
- **2026-03-23**：`Guess` 顶栏右上角补全快照入口：新增相机 icon 按钮（与分享并列），可直接触发本地 PNG 快照生成。
- **2026-03-23**：`Guess` 页 Q2 价格输入框最小宽度由 `3ch` 调整为 `6ch`，提升可读性与触控输入舒适度。
- **2026-03-23**：发起竞猜仅允许 for sale：`Discover` 提交前对明显 `rent/sold` 链接做友好拦截提示；`/api/listings/from-url` 后端做 URL + 页面双重校验（`listing_kind`），`rent/sold` 一律返回 422，不入库、不跳转 Guess。
- **2026-03-23**：发起竞猜 UX 强化：`Discover` 弹窗新增错误 toast（即使弹窗误关也能看到失败原因），`IonModal` 在请求中禁用 dismiss；后端仅允许 `listing_kind === 'sale'`，`unknown` 也拒绝，避免抓取信息不完整时误放行。
- **2026-03-23**：`Discover` 发起弹窗错误反馈改为“仅内联错误文案（无 toast）”；rent/sold 等限制提示文案统一英文。
- **2026-03-23**：修复“最近浏览房源”不更新：在 `Guess` 页加载到 listing 后也写入 `gtp_recent_viewed_listings_v1`（去重+最多3条），确保从粘贴链接等非 Discover 入口进入时同样更新。
- **2026-03-23**：`Search` 空状态卡片去边框：`EmptyStateCard` 增加 `className` 可选参数，并在 `Search` 传 `border-0`。
- **2026-03-24**：排查“发起竞猜长时间分析中无返回”：`listingPageScrape` 全链路外部请求新增超时控制（Bright Data/Residential/Firecrawl/直连/Mapbox），避免单段网络悬挂导致接口长期不返回；`Discover` 发起竞猜前端请求新增 45s 超时与明确报错 `Analysis timed out, please try again.`。
- **2026-03-24**：发起竞猜流程改为“前台快入库 + 后台补全”：`/api/listings/from-url` 先做 URL 意图校验与外部 ID 去重；仅执行 quick 抓取（`listing_kind/address/auction_at` 等关键字段）并立即创建 listing 后返回 `listingId` 跳转 Guess；随后后台异步执行 full 抓取补全 `suburb/state/postcode/latitude/longitude` 等字段并更新入库，显著降低用户等待时长。
- **2026-03-24**：修复发起竞猜体验回归：quick 阶段改为“直连短链路优先（`fetchWithRetryQuick`）+ 有限兜底”，并将 quick 总超时从 15s 提升到 30s，避免 realestate 链接在慢网络下过早超时导致不入库；`Discover` 的 `IonModal` 去除 `canDismiss` 动态切换，改为 `backdropDismiss` + 请求中禁用 Close，消除搜索时弹窗闪烁关闭。
- **2026-03-24**：修复“最近浏览”脏数据：`Guess` 页写入 `gtp_recent_viewed_listings_v1` 时，若 `suburb/postcode` 均为空则暂不写入；新增延迟轮询回查（4s 间隔，最多 4 次）在后台补全入库后再写 localStorage，避免出现 `suburb:null, postcode:null` 的记录污染推荐上下文。
- **2026-03-24**：修复“跳转 Guess 后补全中断”：新增 `POST /api/listings/enrich` 手动补全接口（按 `listingId` 执行 full 抓取并更新 `suburb/state/postcode/lat/lng` 等）；`Guess` 页检测到核心字段缺失时自动触发一次该接口，避免 serverless 场景下 fire-and-forget 任务被回收导致数据长期不完整。
- **2026-03-24**：采纳“最简策略”并回退复杂补全链路：`/api/listings/from-url` 仅依赖一次 quick 抓取（`listing_kind/address/cover_image_url/auction_at`），`suburb/state/postcode` 改为从 `address` 同步解析，`latitude/longitude` 缺失时按 `address` 同步 Mapbox geocode；移除 `POST /api/listings/enrich` 与 `Guess` 页主动补全逻辑，避免多段兜底带来的中断与一致性问题。
- **2026-03-25**：realestate 抓取对比（Bella Vista 样例页）：新增 `scripts/run-scrapfly-realestate.py`（读 `.env.local` 的 `SCRAPFLY_KEY`，调用 [scrapfly realestatecom-scraper](https://github.com/scrapfly/scrapfly-scrapers/tree/main/realestatecom-scraper)）与 `scripts/compare-realestate-scrape.ts`（测当前 `listingPageScrape` quick）；完整 Scrapfly 输出写入 `apps/web/tmp/compare-scrapfly-clean.json` 供对照。结论（单次样本）：Scrapfly 约 16–19s 且返回结构化 Argonaut 数据（含坐标）；当前 Bright Data 链路 quick 约 13s 成功时字段与拍卖时间一致，但 quick 不含页内坐标（`latitude/longitude` 为 null），且遇 429/代理失败时会整次失败（波动性大）。
- **2026-03-25**：Discover「粘贴链接发起竞猜」仅面向终端用户开放 **domain.com.au**；**realestate.com.au** 在点击解析前即拦截并提示「抓取过慢、由后台管理员录入」，不再发起 `/api/listings/from-url`。后端仍保留 realestate 解析能力供管理端或其它入口使用。
- **2026-03-25**：`Guess` 页问卷展示：`auction_at` 为空或无法解析时仍显示投票问卷；仅当 `auction_at` 有效且当前时间已晚于该时间时关闭问卷（与 `showAuctionResultBlock` 仍按「有拍卖时间且已过」展示结果区一致）。
- **2026-03-25**：`Guess` 房源卡片：`auction_at` 为空时整行仅显示 `For sale`（不显示 `Auction At：` 前缀）；有拍卖时间时仍为 `Auction At：` + 格式化时间。
- **2026-03-25**：`Discover` 推荐列表卡片：与 `Guess` 相同逻辑，`auction_at` 有时显示 `Auction Time：` + 时间，无时整行仅 `For sale`。
- **2026-03-25**：`/api/listings/recommendations` 放宽：`status=upcoming` 下允许 `auction_at` 为 `null` 的房源进入推荐池；仍排除「有 `auction_at` 且已早于当前时刻」的 listing（与「仍可竞猜的 upcoming」一致）。
- **2026-03-25**：`Search` 页「Future auctions/For sale」：与推荐接口一致，`upcoming` 且（`auction_at` 为空 **或** `auction_at` 晚于当前时刻）；「Recent」改为与 Future 互斥——`status ≠ upcoming` **或**（`upcoming` 且 `auction_at <= now`；空 `auction_at` 不匹配 `lte`，故不再与 Future 重复）；Surrounding Suburbs 查询同步；`isFutureAuctionListing` 对无拍卖时间的 `upcoming` 视为可 GUESS。
- **2026-03-25**：`Search` 列表与 Surrounding Suburbs 卡片：`auction_at` 有时显示 `Auction Time：` + 时间，无时整行仅 `For sale`（与 `Discover` 一致）。
- **2026-03-25**：`Search` 无搜索词且 Supabase 可用时不再展示空态插画与「Start with a suburb…」；仅保留「未配置 Supabase」与「有搜索词但无结果」时的 `EmptyStateCard`。
- **2026-03-25**：`Search`「No matches」仅在用户**已点击 Search / 回车并完成一次成功查询**且当前输入框内容仍与提交关键词一致、列表为空时展示；输入中未提交不再误报；查询报错时清空 `lastSubmittedKeyword`，不显示无结果卡。
- **2026-03-25**：`Search` 页正文去掉 `IonContent` 的 `--padding-bottom:0`，底部改为 `4.5rem + safe-area-inset-bottom`，避免「Show Surrounding Suburbs」等被底部 Tab 遮挡。
- **2026-03-25**：`Guess` 页「Auction Result」在有成交价时：在「Sold at」上方增加 `status`（与 `Search` 列表脚本的原始 DB 值展示一致，缺省 `upcoming`）；`sold_at` 改为仅日期（复用 `formatAuctionDateOnly`，不含时分）。
- **2026-03-25**：`Discover` 顶部「发起新竞猜」按钮图标由 `addCircleOutline` 改为 `gameControllerOutline`（手柄/游戏机 outline，与其它工具栏图标风格一致）。
- **2026-03-25**：站点品牌化：根目录 PNG 重命名为并放入 `apps/web/app/icon.png`（Next 约定，构建后提供 `/icon.png` 路由）；`app/layout.tsx` 的 `metadata.title` 改为 `Guess Price - Street Auction Watch`，更新 `description`，并声明 `icons` 与 `apple-touch-icon` 指向 `/icon.png`。
- **2026-03-25**：`MyGuesses` 页「Sold At」：`formatSoldAt` 改为 `en-AU` + `dateStyle: 'medium'`（仅日期、无时间）。
- **2026-03-25**：产品界面语言统一为英文：扫描 `apps/web` 下用户可见文案（页面 UI、`aria-label`、API 返回 `error`、抓取/代理失败 `Error` 消息等），将中文改为英文；代码与 JSDoc 注释保留中文未改。顺带将 UI 中的全角冒号 `：` 改为英文半角 `:`，并补回 `Guess`「Auction Result」区块内缺失的 `status` / `Sold at` 标签行。
- **2026-03-25**：`Search` 周边扩展：主搜索结束且 `listings.length === 0` 时仍显示 「Show Surrounding Suburbs」（需能解析到锚点：同关键词下任取一带坐标 listing）；新增 `surroundAnchor` 状态；`loadSurroundingSuburbs` 在 **Recent** 模式下与主列表一致使用 `recentAuctionsOrFilter` 及 `sold_at` / `updated_at` 排序。
- **2026-03-25**：修复「无结果时周边按钮仍 disabled」：若库内无带坐标 listing，则新增 `GET /api/geocode/search-center`（`MAPBOX_TOKEN`）将 suburb/postcode 粗定位为中心点，合成锚点 `__gtp_map_anchor__`；邮编搜索时在周边列表中排除同 postcode，避免与「周边」语义重复。
- **2026-03-25**：修复合成地图锚点下周边查询 400：`listings.id` 为 UUID 时勿对 `__gtp_map_anchor__` 使用 `neq`（非 UUID 导致 PostgREST 报错）；仅真实 listing 锚点时才 `neq` 排除自身。
- **2026-03-25**：`Search`：主列表无结果时，若已加载或正在加载 Surrounding Suburbs，则不再显示「No matches」空态（避免与周边列表同时出现）。
- **2026-03-25**：`Me` 个人页展示名可编辑：姓名行右侧 `createOutline` 打开弹窗，`POST /api/user/display-name`（Bearer access token）校验后合并写入 Supabase Auth `user_metadata.full_name` + `name`；前端 `refreshSession` 刷新会话。无需单独 `profiles` 表。
- **2026-03-25**：修复 `display-name` API 400：服务端勿用 `supabase.auth.updateUser`（无浏览器 session 时 `AuthSessionMissingError`）；改为直连 GoTrue `PUT {SUPABASE_URL}/auth/v1/user`，body `{ data: mergedMetadata }`，并 `JSON.parse(JSON.stringify)` 净化 metadata。
- **2026-03-25**：修复 Feed 不刷新：`Feed` 原 `useEffect([])` 仅在首次挂载请求；Ionic Tab 会保留子页实例，竞猜返回后仍为空列表。改为 `useIonViewWillEnter` 每次进入 Feed 拉取；`fetch` 使用 `cache: 'no-store'`，`/api/feed` 响应增加 `Cache-Control: no-store`。
- **2026-03-25**：`Me` 未登录态：隐藏 Sign Out；OAuth 改为原生 `<button>` + 44px `IonIcon`（去掉 `IonButton` 边框与小图标问题），间距 `gap-8`。
- **2026-03-25**：补全 **Apple Sign In**：新增 `@capacitor-community/apple-sign-in@5.0.0`（对齐 Capacitor 5）。**Capacitor iOS** 走 `SignInWithApple.authorize` + `supabase.auth.signInWithIdToken`（nonce：SHA-256 十六进制给 Apple、原始随机串给 Supabase，与官方 Flutter 示例一致）；**Web/Android** 仍用 `signInWithOAuth`，并增加 `scopes: 'name email'`。可选环境变量 `NEXT_PUBLIC_APPLE_IOS_CLIENT_ID`（默认可与 `capacitor.config` 的 App ID 对齐，需在 Supabase Apple 提供商 **Client IDs** 中登记同一 Bundle ID）。
- **2026-03-25**：修复 OAuth 后无法关闭「我的」：`history` 仍含 `/auth/callback` 时，`goBack()` 会再次进入 `AuthCallback`，因 session 已存在又 `replace('/me')` 形成循环并闪现 *Finishing sign-in*。新增 `lib/oauthReturnFlow.ts`（`signInWithOAuth` 前 `beginOAuthReturnFlow`），`AuthCallback` 用 sessionStorage 区分首次落地与二次进入：二次进入改 `replace('/discover')` 并清理标记。

---

## 12. 进度日志（Weekly Log）

> 每周/每次推进后，追加一条：做了什么、遇到什么问题、下周做什么。

- **2026-03-18**：
  - 完成：项目计划与方向确定；明确移动端优先与 App 化布局约束；UI 候选升级为 Ionic（首推）/Framework7/Konsta，并保留 `quizify` 作为降级备选
  - 完成：在 `apps/web` 初始化 Ionic+Capacitor 的 Next.js 模板；本地开发服务器可运行
  - 完成：底部 Tab 信息架构落地为「发现/竞猜/榜单/我的」，并创建 4 个页面占位
  - 完成：接入 Supabase SDK，并在「我的」页实现 Google 登录/退出的最小 UI（缺少 `.env.local` 时自动提示配置）
  - 完成：发现页/竞猜页接入 Supabase（读取 listings、投票 upsert、统计展示）
  - 下步：接入 Supabase（Auth + listings/votes/outcomes 最小表）；跑通“登录→投票→统计”最短链路
- **2026-03-18（补充）**：
  - 完成：竞猜页统计可视化（环形图 + 价格分布横向条形图），移动端 `ResponsiveContainer` 自适应宽度
- **2026-03-20**：
  - 完成：「我的」→「我的竞猜」页面，联表 `votes` + `listings` 展示地址、预测价、实际价与售出时间
  - 完成：「我的」页新增 `Privacy` / `Terms` 链接入口
  - 完成：修复 realestate 链接发起竞猜偶发 `HTTP 429` 时的失败问题（抓取链路增强，直连失败后走只读镜像继续抓取）
  - 完成：接入 Bright Data 抓取通道（支持自动探测 active zone，若无可用 zone 则回传明确提示）
  - 验证：realestate 房源链接在本机经 Unlocker 需 **Premium domains**；住宅代理可走通 TLS 但仍会遇目标站 **HTTP 429** 反爬页（需 Premium 或更强浏览器抓取）
  - 完成：抓取后新增 Mapbox Geocoding 兜底（`MAPBOX_TOKEN`），在页面不暴露坐标时按地址补齐 `latitude/longitude`，与 `auction_at` 同次处理完成。
- **2026-03-24**：
  - 完成：针对“长时间分析不出来”增加抓取链路超时保护，确保后端可在可控时间内返回成功或失败，而非前端长期转圈。
  - 完成：`Discover` 发起竞猜请求加入前端超时与错误提示，用户可感知失败并可重试。
  - 结论：你提供的 Castle Hill 链接在本地脚本抓取可于约 14s 完成（非结构解析问题），更可能是偶发外部依赖悬挂导致。
  - 完成：实现“分阶段抓取+存储”链路（quick -> create+redirect -> async enrich），将重型补全过程移到后台执行，前端不再等待完整 geocode 与地址拆分。
