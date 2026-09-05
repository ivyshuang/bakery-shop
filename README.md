# Bakery Shop MVP · Cloudflare Workers + Static Assets + D1

一个适合私房烘焙轻启动的极简下单系统：顾客手机下单、支付宝二维码人工收款、商家后台管理订单和商品。

当前项目使用新版 Cloudflare Worker 结构：

```text
src/index.js                 # Worker 入口与 API 路由
src/handlers/                # API 业务逻辑
public/                      # Worker Static Assets
  index.html                 # 顾客下单页
  admin/                     # 商家后台
  assets/alipay-qr.svg       # 支付宝收款码
wrangler.jsonc               # Worker 部署配置
schema.sql                   # D1 数据库结构和示例商品
```

旧的 Pages Functions `functions/` 目录已移除。静态页面和现有 URL 保持不变，`/api/*` 由 `src/index.js` 统一路由。

## Cloudflare 部署

### 1. 确认 Worker 名称

`wrangler.jsonc` 中的默认名称是：

```json
"name": "bakery-shop"
```

如果控制台里的 Worker 名称不同，可以将这里改为控制台显示的名称。Workers Builds 通常也会在 CI 中自动使用已连接项目的名称。

### 2. 配置 Git 构建

在 Worker 的 **Settings → Builds** 中连接这个 GitHub 仓库，并使用：

```text
Root directory: /
Build command: npm run check && npm test
Deploy command: npx wrangler deploy
```

Wrangler 会读取 `wrangler.jsonc`，打包 `src/index.js`，并上传 `public/` 中的静态资源。

### 3. 绑定现有 D1 数据库

推荐把现有 D1 数据库写进 `wrangler.jsonc`，这样 Git 自动部署时绑定不会依赖控制台状态。进入 D1 数据库详情页复制数据库 UUID，并在 `wrangler.jsonc` 顶层加入：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "bakery-db",
    "database_id": "这里填写真实的数据库 UUID"
  }
]
```

代码通过 `env.DB` 访问数据库，因此 `binding` 必须是 `DB`。不要提交虚假的占位 UUID；当前仓库因为无法读取你的 Cloudflare 账户而没有预填这一段。

也可以先在 Worker 的 **Settings → Bindings → Add binding → D1 database** 中手动绑定：

```text
Variable name: DB
D1 database: bakery-db（或你已经创建的数据库）
```

但 `wrangler.jsonc` 是自动部署的配置源，正式使用前仍建议补上真实 UUID。如果数据库还没有表，在 D1 控制台执行一次完整的 `schema.sql`。

### 4. 设置后台口令

进入 Worker 的 **Settings → Variables and Secrets**，新增加密 Secret：

```text
ADMIN_TOKEN = 一段至少 20 位的随机口令
```

后台地址是：

```text
https://你的域名/admin/
```

后台在请求头 `X-Admin-Token` 中发送口令；口令只保存在当前浏览器的 `sessionStorage`。

### 5. 验证上线结果

依次访问：

```text
https://你的域名/
https://你的域名/api/products
https://你的域名/admin/
```

`/api/products` 应返回类似：

```json
{"products":[]}
```

如果返回 `D1 binding DB 未配置`，说明 Worker 已正常运行，但还需要完成第 3 步的 D1 绑定。

## 本地检查与开发

```bash
npm run check
npm test
npm run dev
```

`npm run dev` 会启动 Wrangler 本地环境。D1 默认使用本地数据；需要先在本地执行 `schema.sql`，或在配置真实数据库 ID 后按需使用 Wrangler 的远程开发选项。

部署命令：

```bash
npm run deploy
```

## API 路由

```text
GET   /api/products
POST  /api/order
GET   /api/admin/orders
PATCH /api/admin/order/:id
GET   /api/admin/products
POST  /api/admin/products
PATCH /api/admin/product/:id
```

所有 `/api/admin/*` 路由都要求正确的 `X-Admin-Token`。

## 上线前需要修改

1. 用自己的收款二维码替换 `public/assets/alipay-qr.svg`。
2. 在 `public/index.html` 中修改店名和自提说明。
3. 将 D1 数据库绑定为 `DB`。
4. 将 `ADMIN_TOKEN` 设置为加密 Secret。

第一版仍然采用人工确认支付宝到账，没有接入支付 API、短信、配送、会员或库存系统。
