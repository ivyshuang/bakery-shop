# Bakery Shop MVP · Cloudflare Pages + Functions + D1

一个适合私房烘焙轻启动的极简下单系统：

- 顾客手机下单
- 自动生成 5 位取餐码
- 支付宝二维码人工收款
- 商家后台查看订单
- 确认收款 / 开始制作 / 可取餐 / 已取餐 / 取消
- 后台直接新增、改价、上下架商品
- Cloudflare D1 存储订单
- `ADMIN_TOKEN` 保护后台 API

> 第一版故意不接支付宝 API。顾客下单后扫码付款，你在后台人工点“确认收款”。这样上线成本最低。

---

## 目录

```text
public/                    # Cloudflare Pages 静态站
  index.html               # 顾客下单页
  app.js
  styles.css
  assets/alipay-qr.svg     # 换成你的支付宝二维码
  admin/                   # 商家后台
functions/                 # Pages Functions API
  api/products.js
  api/order.js
  api/admin/...            # 后台 API（受 ADMIN_TOKEN 保护）
schema.sql                 # D1 数据库结构 + 3 个示例商品
```

## 1. 先换支付宝二维码

把：

```text
public/assets/alipay-qr.svg
```

替换成你自己的支付宝收款二维码图片。

最简单可以改成：

```text
public/assets/alipay-qr.png
```

然后把 `public/index.html` 中：

```html
<img src="/assets/alipay-qr.svg" alt="支付宝收款码" />
```

改成：

```html
<img src="/assets/alipay-qr.png" alt="支付宝收款码" />
```

## 2. 推到 GitHub

在项目目录执行：

```bash
git init
git add .
git commit -m "Initial bakery shop"
git branch -M main
git remote add origin https://github.com/你的用户名/bakery-shop.git
git push -u origin main
```

## 3. Cloudflare 创建 D1

Cloudflare Dashboard -> Workers & Pages -> D1 -> Create database。

数据库名可以叫：

```text
bakery-db
```

创建后打开 D1 控制台，把 `schema.sql` 全部粘贴执行。

它会创建 3 张表，并加入三个测试商品：海盐卷、原味贝果、黄油曲奇。

## 4. 创建 Cloudflare Pages 项目

Dashboard -> Workers & Pages -> Create -> Pages -> Import an existing Git repository。

选择 GitHub 的 `bakery-shop`。

推荐配置：

```text
Framework preset: None
Production branch: main
Build command: exit 0
Build output directory: public
Root directory: /
```

部署。

## 5. 绑定 D1

Pages 项目 -> Settings -> Bindings -> Add -> D1 database bindings。

```text
Variable name: DB
D1 database: bakery-db
```

保存后重新部署一次。

代码中所有 `env.DB` 都指向这个数据库。

## 6. 设置后台口令 ADMIN_TOKEN

Pages 项目 -> Settings -> Environment variables。

新增：

```text
ADMIN_TOKEN = 一段足够长的随机密码
```

例如不要用 `123456`，建议 20 位以上随机字符串。

保存后重新部署。

后台地址：

```text
https://你的项目.pages.dev/admin/
```

打开后输入 `ADMIN_TOKEN`。

口令只保存在当前浏览器的 `sessionStorage`，关掉浏览器标签后通常需要重新输入。

## 7. 顾客下单地址

```text
https://你的项目.pages.dev/
```

流程：

```text
选择商品
-> 填姓名/联系方式
-> 提交订单
-> 自动生成取餐码
-> 显示应付金额 + 支付宝二维码
-> 你后台确认收款
-> 制作
-> 标记可取餐
-> 顾客报码
-> 点确认取餐
```

## 8. 后台商品管理

进入 `/admin/` -> 商品：

- 新增商品
- 修改名称
- 修改价格
- 修改描述
- 修改 emoji
- 上架 / 下架

价格前端显示人民币，数据库内部始终用“分”存储，避免浮点金额问题。

## 9. 自定义域名

Pages 项目 -> Custom domains -> Set up a domain。

例如：

```text
shop.example.com
```

你前面说的永久二维码建议另留：

```text
go.example.com
```

二维码永远编码 `https://go.example.com`，再让它跳转到当前下单站。以后换小程序或新网站，只改跳转目标，不重印二维码。

## 10. 可选：再加 Cloudflare Access

模板本身已经用 `ADMIN_TOKEN` 保护后台 API。

如果想再加一道门，可以用 Cloudflare Access 限制 `/admin/*`，只允许你的邮箱访问。

## 本地开发（可选）

需要 Node.js，然后安装 Wrangler：

```bash
npm install -g wrangler
```

D1 本地开发可以使用 Wrangler Pages Dev，并按 Cloudflare 文档给 `DB` 绑定本地/远程 D1。

第一版如果不需要本地调试，直接 GitHub -> Pages -> D1 会更简单。

## 上线前你应该改的 4 个地方

1. `public/assets/alipay-qr.svg` -> 你的支付宝二维码
2. `public/index.html` -> 店名、自提说明
3. `/admin/` -> 商品名称和价格
4. Cloudflare -> 设置 `ADMIN_TOKEN`

## 当前 MVP 没做的功能

为了保持轻量，目前没有：

- 支付宝支付 API / 自动确认到账
- 短信通知
- 微信通知
- 自动配送
- 每日库存扣减
- 预约时间段容量限制
- 登录会员

这些都可以在跑通订单后再加。
