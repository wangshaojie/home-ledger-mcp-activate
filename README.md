# home-ledger-mcp-activate

家庭记账 MCP 设备的**激活页**,跑在 Vercel 免费版上。

## 流程

```
用户浏览器 → mcp.240730.xyz/activate
                ↓ 邮箱 OTP 登录
              Supabase Auth
                ↓ 输入设备名
            POST /api/issue-token
                ↓
            调 Supabase issue_mcp_token
                ↓
            返回 mcp_token(只显示一次)
                ↓
        用户复制 → 终端跑 home-ledger-mcp login
```

## 文件结构

```
mcp-activate/
├── api/
│   └── issue-token.ts     # 后端 API:用用户 access_token 调 issue_mcp_token
├── pages/
│   ├── _app.tsx
│   ├── index.tsx          # 重定向到 /activate
│   └── activate.tsx       # 4 步激活页(邮箱→OTP→设备名→token)
├── public/                # 静态资源(空)
├── package.json
├── next.config.js
├── vercel.json            # Vercel 部署配置(sin1 区域 = 新加坡,跟 Supabase 同区)
└── tsconfig.json
```

## 部署步骤(从 0 到 1)

### 1. 准备

- Vercel 账号(https://vercel.com 注册)
- 域名 `240730.xyz` 的 DNS 解析权限(在域名注册商)
- Supabase project(已有,拿 URL + anon key)

### 2. 把代码 push 到 GitHub

```bash
cd home-ledger/mcp-activate
git init
git add .
git commit -m "init: mcp activate page"
# 在 GitHub 创一个 repo(例: home-ledger-mcp-activate)
git remote add origin https://github.com/wangshaojie/home-ledger-mcp-activate.git
git push -u origin main
```

> 注:可以放独立 repo,跟 home-ledger 主项目分开。`home-ledger` 是 Electron 桌面端,这个是纯前端 + API,放一起会让 .gitignore 互相干扰。

### 3. 在 Vercel 导入

1. 打开 https://vercel.com/dashboard
2. **Add New → Project** → 选 `home-ledger-mcp-activate` repo → Import
3. Framework Preset 自动选 Next.js
4. **环境变量**(这一步关键):
   - `SUPABASE_URL` = `https://xxxxx.supabase.co`
   - `SUPABASE_ANON_KEY` = `eyJhbGc...`(你的 anon public key)
   - `NEXT_PUBLIC_SUPABASE_URL` = 同上(给前端用,必须 NEXT_PUBLIC_ 前缀)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 同上
5. 点 **Deploy**

### 4. 挂域名 mcp.240730.xyz

1. Vercel 项目 → Settings → Domains
2. 输入 `mcp.240730.xyz` → Add
3. Vercel 告诉你加一条 CNAME: `mcp.240730.xyz → cname.vercel-dns.com`
4. 去域名注册商加这条 CNAME 记录
5. 等几分钟,Vercel 自动签发 Let's Encrypt 证书

### 5. 测试

打开 https://mcp.240730.xyz/activate:

- 第 1 步:输入你的家庭记账邮箱 → 发验证码
- 第 2 步:收邮件 → 输 6 位 OTP
- 第 3 步:输入设备名(例 "我的 Mavis")→ 授权
- 第 4 步:看到 token 框 → 复制

如果有任何一步失败,看 Vercel 的 Runtime Logs。

## 故障排查

| 现象 | 原因 | 修法 |
|------|------|------|
| 配置错误页面 | NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 没设 | Vercel env 加 |
| 发验证码失败 | Supabase SMTP 没开 / 项目在 paused 状态 | Supabase dashboard 看 Auth → Providers |
| 授权失败,提示"未登录" | access_token 过期 | 重发 OTP 重新登录 |
| 授权失败,提示"5 台" | 设备数满 | Supabase SQL Editor: `update mcp_device_tokens set revoked_at = now() where user_id = (你的 user id) and revoked_at is null;` |
| 域名打不开 | DNS 没生效 | `nslookup mcp.240730.xyz` 看是否解析到 cname.vercel-dns.com |
| Vercel 函数超时 | Supabase 冷启动 | 免费版偶尔 5-10 秒,等几秒重试 |

## 安全设计

1. **access_token 永不出 Vercel 函数** — 浏览器 → /api/issue-token → Supabase,token 只在函数内存里
2. **mcp_token 只在最终 HTTP 响应里出现** — 不写日志,不进数据库(数据库存的是 bcrypt 哈希)
3. **后端只接 access_token 验身份** — 不接 email/password,攻击面最小
4. **CORS 限制同源** — 浏览器只能从 mcp.240730.xyz 自己调 /api
5. **Vercel 函数 no-store 缓存** — 防止 token 响应被 CDN 缓存

## License

UNLICENSED — 家庭记账项目专用
