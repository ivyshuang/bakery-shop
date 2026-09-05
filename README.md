# Bakery Shop MVP · Cloudflare Workers + D1 + 支付宝

一个适合私房烘焙轻启动的在线下单系统：

- 顾客手机下单
- 自动生成 5 位取餐码
- 提交订单后直接唤起支付宝
- 支付宝异步通知并自动确认到账
- 商家后台查看和处理订单
- 后台新增、改价、上架或下架商品
- Cloudflare D1 存储商品和订单
- `ADMIN_TOKEN` 保护后台 API

支付使用支付宝“手机网站支付”产品和 RSA2 普通公钥模式。下面从零开始完成部署。

## 项目结构

```text
public/                       # 顾客页面、商家后台和静态资源
  index.html                  # 顾客下单页
  app.js
  styles.css
  admin/                      # 商家后台
src/
  index.js                    # Cloudflare Worker 入口和 API 路由
  handlers/                   # 商品、订单、支付通知和后台 API
  payments/alipay.js          # 支付宝 RSA2 签名与验签
migrations/                   # 已有 D1 数据库的升级脚本
wrangler.jsonc                # Worker、D1 和静态资源配置
schema.sql                    # 新数据库结构和示例商品
```

## 1. 准备账号

你需要：

- GitHub 账号
- Cloudflare 账号
- 支付宝开放平台商家应用
- 应用已开通“手机网站支付”
- 接口加签方式为“RSA2 普通公钥模式”
- 如果需要本地调试，本机安装 Node.js 和 Git

GitHub 仓库可以设为 Private。安装 Cloudflare Workers and Pages GitHub App 时，只授权这个仓库即可，不需要公开代码。

## 2. 准备支付宝应用信息

登录支付宝开放平台，进入开通了“手机网站支付”的应用，准备：

```text
APP_ID                  支付宝应用 ID
应用私钥                由你生成，Worker 用它对支付请求签名
支付宝公钥              支付宝提供，Worker 用它验证付款通知
```

需要特别注意：

- `ALIPAY_PUBLIC_KEY` 填“支付宝公钥”，不是你上传的“应用公钥”。
- 应用公钥上传给支付宝；与它配对的应用私钥由你自己保管。
- 应用私钥必须是 PKCS#8 格式，通常以 `-----BEGIN PRIVATE KEY-----` 开头。
- 任何私钥都不能写进代码、README、GitHub 或 `wrangler.jsonc`。
- 后面会把这些值保存为 Cloudflare 加密 Secret。

## 3. 自定义店铺内容

打开 `public/index.html`，修改店名、营业说明和自提提示。商品不需要写进 HTML，部署后可以在商家后台维护。

## 4. 创建 D1 数据库

登录 Cloudflare Dashboard，找到 **D1 SQL Database**，点击 **Create database**。

数据库名建议使用：

```text
bakery-db
```

### 新建数据库

进入数据库的 Console，把项目根目录下的 `schema.sql` 全部粘贴并执行。

它会创建：

- `products`：商品
- `orders`：订单和支付宝交易信息
- `order_items`：订单明细

同时加入海盐卷、原味贝果和黄油曲奇三个示例商品。

### 已经使用过旧版数据库

如果旧数据库已经有商品或订单，不要重新执行完整的 `schema.sql`。只在 D1 Console 中执行一次：

```text
migrations/0001_alipay_wap.sql
```

它会给已有的 `orders` 表增加支付宝商户订单号、支付宝交易号和付款时间。迁移只能执行一次。

## 5. 配置 D1 绑定

在 D1 数据库详情页复制 Database name 和 Database ID（UUID）。

打开 `wrangler.jsonc`，确认配置类似：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "bakery-db",
    "database_id": "你的真实数据库 UUID"
  }
]
```

注意：

- `binding` 必须是 `DB`，代码通过 `env.DB` 访问数据库。
- `database_id` 必须是真实 UUID。
- D1 UUID 是资源标识符，不是访问密码；真正的密钥仍然只能保存在 Secret 中。

## 6. 推送到 Private GitHub 仓库

在 GitHub 创建一个 Private 仓库，然后在项目目录执行：

```bash
git init
git add .
git commit -m "Initial bakery shop"
git branch -M main
git remote add origin https://github.com/你的用户名/bakery-shop.git
git push -u origin main
```

如果已经连接 GitHub：

```bash
git add .
git commit -m "Add Alipay mobile website payment"
git push
```

## 7. 在新版 Cloudflare 控制台创建 Worker

进入：

```text
Workers & Pages
→ Create application
→ Import a repository
```

授权 GitHub 时选择 **Only select repositories**，只勾选 `bakery-shop`。

构建配置：

```text
Production branch: main
Root directory: /
Build command: npm run check && npm test
Deploy command: npx wrangler deploy
```

第一次部署会上传 Worker 和 `public/` 静态资源。此时支付 Secret 还没有设置，下单接口暂时不可用是正常的。

如果 Worker 已经存在，进入该 Worker 的 **Settings → Builds**，连接 GitHub 仓库并使用相同配置，不要再创建第二个 Worker。

## 8. 设置后台和支付宝 Secrets

第一次部署完成后，进入 Worker：

```text
Settings
→ Variables and Secrets
→ Add
```

依次创建以下加密 Secret：

```text
ADMIN_TOKEN             后台口令，建议至少 20 位随机字符
ALIPAY_APP_ID            支付宝应用 APP_ID
ALIPAY_APP_PRIVATE_KEY   PKCS#8 格式的应用私钥
ALIPAY_PUBLIC_KEY        支付宝提供的支付宝公钥
```

粘贴 PEM 密钥时可以保留头尾标记和换行；代码也兼容只有 Base64 正文的形式。

再新增一个普通文本变量：

```text
PUBLIC_BASE_URL = https://你的正式域名
```

例如：

```text
PUBLIC_BASE_URL = https://shop.example.com
```

它用于生成支付宝的同步返回地址和异步通知地址。正式收款时应使用支付宝应用中登记的 HTTPS 域名，不要填写末尾路径。

保存并按控制台提示部署新版本。`wrangler.jsonc` 中的 `keep_vars: true` 会在后续 Git 自动部署时保留这些控制台变量。

## 9. 绑定正式域名

进入 Worker 的 **Settings → Domains & Routes → Add**，绑定由 Cloudflare 托管 DNS 的域名，例如：

```text
shop.example.com
```

域名必须与 `PUBLIC_BASE_URL` 一致，也应与支付宝应用提交审核时登记的网站域名保持一致。

如果暂时没有自定义域名，可以先用 Worker 的 `workers.dev` HTTPS 地址联调，并把完整 origin 填入 `PUBLIC_BASE_URL`，例如：

```text
https://bakery-shop.你的子域.workers.dev
```

生产使用前请确认支付宝后台允许该域名。

## 10. 验证基础页面

依次访问：

```text
顾客页面：https://你的域名/
商品接口：https://你的域名/api/products
商家后台：https://你的域名/admin/
```

商品接口应返回 JSON。进入 `/admin/` 后，输入第 8 步设置的 `ADMIN_TOKEN`。

如果 `/api/products` 返回 `D1 binding DB 未配置`，检查 `wrangler.jsonc` 中的数据库 UUID 和 `DB` 绑定，然后重新部署。

## 11. 测试支付宝支付

建议先创建一件价格很低的测试商品，再用手机浏览器操作：

```text
选择商品
→ 填写姓名和联系方式
→ 提交订单
→ 跳转支付宝手机网站收银台
→ 核对收款方和金额
→ 完成付款
→ 返回网站并显示取餐码
→ 后台订单自动变成“已付款”
```

不要只根据浏览器返回页面判断是否支付成功。系统以支付宝发给下面地址的 RSA2 验签通知为准：

```text
https://你的正式域名/api/payment/alipay/notify
```

通知会同时核对：

- 支付宝签名
- `APP_ID`
- 商户订单号
- 支付金额
- 支付宝交易号

只有全部正确，Worker 才会把订单标记为已付款。

每个支付宝支付订单的有效时间为 30 分钟。超时后顾客需要重新下单。

如果顾客从微信内置浏览器打开页面，微信可能阻止唤起支付宝。这种情况下需要提示顾客点击右上角，改用系统浏览器打开。普通手机浏览器会进入支付宝 App 或支付宝网页收银台。

## 12. 日常使用

顾客访问首页完成下单和付款。商家访问：

```text
https://你的域名/admin/
```

后台可以：

- 查看待付款、制作中、待取餐和已取餐订单
- 手动确认收款作为特殊情况下的备用操作
- 更新制作状态
- 新增和修改商品
- 上架或下架商品

金额在数据库中始终以“分”为单位保存，避免浮点金额误差。

## 13. 本地开发（可选）

创建 `.dev.vars`，仅用于本地开发：

```text
ADMIN_TOKEN="本地后台口令"
ALIPAY_APP_ID="你的 APP_ID"
ALIPAY_APP_PRIVATE_KEY="你的 PKCS#8 应用私钥"
ALIPAY_PUBLIC_KEY="支付宝公钥"
PUBLIC_BASE_URL="http://localhost:8787"
```

`.dev.vars` 已加入 `.gitignore`，不要强制提交。

初始化本地 D1：

```bash
npx wrangler d1 execute bakery-db --local --file=./schema.sql
```

检查并启动：

```bash
npm run check
npm test
npm run dev
```

本地地址通常是 `http://localhost:8787`。支付宝无法从公网回调 localhost，因此完整支付通知必须在 HTTPS 测试域名或正式域名上验证。

## 常见问题

### 提交订单后提示“下单失败”

查看 Worker Logs，检查三个支付宝配置是否存在。已有数据库还要确认执行过 `migrations/0001_alipay_wap.sql`。

### 应用私钥格式错误

代码需要 PKCS#8 私钥，即 `BEGIN PRIVATE KEY`。如果文件开头是 `BEGIN RSA PRIVATE KEY`，请使用支付宝密钥工具重新生成 PKCS#8 密钥，或在本机安全转换后再保存为 Secret。

### 支付宝提示签名错误

检查：

- `ALIPAY_APP_ID` 是否属于当前应用。
- `ALIPAY_APP_PRIVATE_KEY` 是否与上传给支付宝的应用公钥配对。
- 加签方式是否为 RSA2 普通公钥模式。
- Secret 内容是否被截断或粘贴错误。

### 支付成功，但后台仍是待付款

检查 Worker Logs 中 `/api/payment/alipay/notify` 的请求。常见原因：

- `ALIPAY_PUBLIC_KEY` 错填成了应用公钥。
- 数据库没有执行支付迁移。
- `PUBLIC_BASE_URL` 与实际域名不一致。
- 支付宝应用没有登记或允许当前域名。

### 后台提示未授权

确认输入的是 Cloudflare 中保存的 `ADMIN_TOKEN`，不是支付宝应用私钥。

## 当前版本尚未包含

- 自动退款和关闭支付宝交易
- 短信或微信通知
- 自动配送
- 每日库存扣减
- 预约时间段容量限制
- 会员登录

这些功能可以在订单和支付流程稳定后逐步增加。
