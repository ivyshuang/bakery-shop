# Bakery Shop MVP · Cloudflare Workers + D1

一个适合私房烘焙轻启动的极简下单系统：

- 顾客手机下单
- 自动生成 5 位取餐码
- 支付宝二维码人工收款
- 商家后台查看订单
- 确认收款 / 开始制作 / 可取餐 / 已取餐 / 取消
- 后台直接新增、改价、上下架商品
- Cloudflare D1 存储商品和订单
- `ADMIN_TOKEN` 保护后台 API

> 第一版故意不接支付宝 API。顾客下单后扫码付款，你在后台人工点“确认收款”，这样上线成本最低。

## 项目结构

```text
public/                       # 顾客页面、商家后台和静态资源
  index.html                  # 顾客下单页
  app.js
  styles.css
  assets/alipay-qr.svg        # 支付宝收款码
  admin/                      # 商家后台
src/
  index.js                    # Cloudflare Worker 入口和 API 路由
  handlers/                   # 商品、订单和后台 API
wrangler.jsonc                # Worker、静态资源和部署配置
schema.sql                    # D1 数据库结构和示例商品
```

下面从零开始，把项目部署到 Cloudflare Workers。

## 1. 准备账号和工具

你需要：

- 一个 GitHub 账号
- 一个 Cloudflare 账号
- 本机已安装 Git
- 如果需要本地调试，再安装 Node.js

正式部署可以完全通过 GitHub 和 Cloudflare 控制台完成。

## 2. 换成自己的支付宝二维码

把下面的示例文件替换为自己的支付宝收款二维码：

```text
public/assets/alipay-qr.svg
```

如果你的二维码是 PNG，可以保存成：

```text
public/assets/alipay-qr.png
```

然后在 `public/index.html` 中找到：

```html
<img src="/assets/alipay-qr.svg" alt="支付宝收款码" />
```

改成：

```html
<img src="/assets/alipay-qr.png" alt="支付宝收款码" />
```

同时可以在 `public/index.html` 中修改店名、营业说明和自提提示。

## 3. 创建 D1 数据库

登录 Cloudflare Dashboard，找到 **D1 SQL Database**，点击 **Create database**。

数据库名建议使用：

```text
bakery-db
```

创建后进入数据库的 Console，把项目根目录下的 `schema.sql` 全部粘贴并执行。

它会创建：

- `products`：商品
- `orders`：订单
- `order_items`：订单明细

同时加入海盐卷、原味贝果和黄油曲奇三个示例商品。

## 4. 把 D1 写入 Worker 配置

在 D1 数据库详情页复制：

- Database name
- Database ID（UUID）

打开 `wrangler.jsonc`，在 `assets` 前加入 `d1_databases`。配置完成后应类似：

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "bakery-shop",
  "main": "./src/index.js",
  "compatibility_date": "2026-09-05",
  "workers_dev": true,
  "keep_vars": true,
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "bakery-db",
      "database_id": "替换成你的真实数据库 UUID"
    }
  ],
  "assets": {
    "directory": "./public",
    "binding": "ASSETS",
    "run_worker_first": ["/api", "/api/*"],
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

注意：

- `binding` 必须是 `DB`，代码通过 `env.DB` 访问数据库。
- `database_id` 必须替换成真实 UUID，不能保留示例文字。
- 如果数据库名称不是 `bakery-db`，同时修改 `database_name`。

## 5. 推送到 GitHub

在项目目录执行：

```bash
git init
git add .
git commit -m "Initial bakery shop worker"
git branch -M main
git remote add origin https://github.com/你的用户名/bakery-shop.git
git push -u origin main
```

如果项目已经连接 GitHub，只需要提交并推送本次修改：

```bash
git add .
git commit -m "Deploy bakery shop with Cloudflare Workers"
git push
```

## 6. 在新版 Cloudflare 控制台创建 Worker

进入 Cloudflare Dashboard：

```text
Workers & Pages
→ Create application
→ Import a repository
```

授权 GitHub 后选择刚才的 `bakery-shop` 仓库。

构建配置填写：

```text
Production branch: main
Root directory: /
Build command: npm run check && npm test
Deploy command: npx wrangler deploy
```

保存并开始第一次部署。Wrangler 会：

1. 读取 `wrangler.jsonc`。
2. 打包 `src/index.js` 中的 Worker。
3. 把 `public/` 上传为 Worker Static Assets。
4. 把 D1 作为 `env.DB` 绑定给 Worker。

如果你已经创建了名为 `bakery-shop` 的 Worker，可以进入该 Worker 的 **Settings → Builds**，连接 GitHub 仓库并填写相同配置，不需要再创建第二个项目。

## 7. 设置后台口令 ADMIN_TOKEN

第一次部署完成后，进入 Worker：

```text
Settings
→ Variables and Secrets
→ Add
```

新增加密 Secret：

```text
ADMIN_TOKEN = 一段足够长的随机口令
```

建议使用至少 20 位的随机字符串，不要使用 `123456`、手机号或店名。

保存后，如果控制台提示部署新版本，就按提示部署。`wrangler.jsonc` 中的 `keep_vars: true` 会在后续 Git 部署时保留控制台设置的 Secret。

## 8. 验证部署

Worker 部署成功后会得到一个 `workers.dev` 地址，例如：

```text
https://bakery-shop.你的子域.workers.dev
```

依次检查：

```text
顾客页面：https://你的地址/
商品接口：https://你的地址/api/products
商家后台：https://你的地址/admin/
```

商品接口应该返回 JSON，例如：

```json
{
  "products": [
    {
      "id": 1,
      "name": "海盐卷",
      "price_cents": 1200
    }
  ]
}
```

进入 `/admin/` 后，输入第 7 步设置的 `ADMIN_TOKEN`。口令只保存在当前浏览器标签页的 `sessionStorage` 中。

## 9. 顾客下单流程

```text
选择商品
→ 填写姓名和联系方式
→ 提交订单
→ 获得 5 位取餐码
→ 扫支付宝二维码付款
→ 商家后台确认收款
→ 开始制作
→ 标记可取餐
→ 顾客报码取餐
```

金额在数据库中始终以“分”为单位保存，避免浮点金额误差。

## 10. 后台商品管理

进入 `/admin/`，切换到“商品”页面，可以：

- 新增商品
- 修改名称、描述和 emoji
- 修改价格
- 上架或下架

修改会直接写入 D1，无需重新部署网站。

## 11. 绑定自定义域名

进入 Worker 的 **Settings → Domains & Routes → Add**，添加由 Cloudflare 托管 DNS 的域名，例如：

```text
shop.example.com
```

如果线下会印长期使用的二维码，建议二维码指向单独的固定地址，例如：

```text
go.example.com
```

以后换网站或小程序时，只修改这个地址的跳转目标，不需要重印二维码。

## 12. 本地开发（可选）

安装依赖并检查代码：

```bash
npm run check
npm test
```

初始化本地 D1：

```bash
npx wrangler d1 execute bakery-db --local --file=./schema.sql
```

启动本地 Worker：

```bash
npm run dev
```

Wrangler 会显示本地访问地址，通常是：

```text
http://localhost:8787
```

也可以登录 Cloudflare 后从本机部署：

```bash
npx wrangler login
npm run deploy
```

## 常见问题

### `/api/products` 返回 `D1 binding DB 未配置`

检查 `wrangler.jsonc` 是否包含真实的 D1 `database_id`，并确认绑定名称是 `DB`，然后重新部署。

### 后台提示 `ADMIN_TOKEN 尚未配置`

在 Worker 的 **Settings → Variables and Secrets** 中创建名为 `ADMIN_TOKEN` 的 Secret，然后部署新版本。

### 页面能打开，但 `/api/*` 返回 404

确认部署命令是 `npx wrangler deploy`，并确认 `wrangler.jsonc` 中包含：

```jsonc
"main": "./src/index.js",
"run_worker_first": ["/api", "/api/*"]
```

### 修改代码后没有自动上线

检查 Worker 的 **Settings → Builds** 是否连接了正确仓库和 `main` 分支，并查看最新一次 Build 的日志。

## 当前 MVP 没有包含

- 支付宝支付 API / 自动确认到账
- 短信或微信通知
- 自动配送
- 每日库存扣减
- 预约时间段容量限制
- 登录会员

这些功能可以在订单流程跑通以后逐步增加。
