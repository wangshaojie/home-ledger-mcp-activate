// ⚠️ DEPRECATED: 实际 API 在 pages/api/issue-token.ts
// 这个文件留着是因为 git 历史里有它,删了 git push 会很乱。
// Vercel build 时 Next.js 不会编译 api/ 顶层(它属于 Vercel 原生 serverless),
// 但 Next.js 还是会做 type-check 检查 —— 所以这里必须用 Next.js 类型而不是 @vercel/node。
//
// 不要往这个文件加任何代码。所有 API 逻辑在 pages/api/issue-token.ts。

import type { NextApiRequest, NextApiResponse } from 'next';

export default function deprecated_stub(_req: NextApiRequest, res: NextApiResponse) {
  res.status(404).json({
    error: 'deprecated',
    message: '此路径已弃用,请使用 /api/issue-token (由 pages/api 处理)',
  });
}
