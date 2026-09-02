// POST /api/issue-token
// Next.js API route(必须放 pages/api/ 下,放 api/ 顶层 Vercel 不认)
// 入参: { access_token, device_name }
// 流程:用前端传上来的 access_token 创建 authenticated supabase client
//      调 issue_mcp_token(device_name) 拿明文 mcp token
//      返回 { mcp_token, expires_at, device_id }
//
// 安全要点:
//  1. access_token 必须有效(否则 supabase 调 issue_mcp_token 会因 auth.uid()=null 失败)
//  2. device_name 长度限制(防爆)
//  3. 返回的 mcp_token 只在此 HTTP 响应里出现一次,前端必须立刻复制
//  4. 服务端不记录任何 token 到日志
//  5. 所有错误返 JSON,绝不返 HTML

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 关键:任何响应都强制 JSON
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // 这种情况:env 没设,直接明说
    return res.status(500).json({
      error: 'server_misconfigured',
      message: `服务器未配置 Supabase env (SUPABASE_URL=${SUPABASE_URL ? '已设' : '缺失'}, SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY ? '已设' : '缺失'})`,
    });
  }

  const { access_token, device_name } = (req.body ?? {}) as {
    access_token?: string;
    device_name?: string;
  };

  if (!access_token || typeof access_token !== 'string') {
    return res.status(400).json({ error: 'missing_access_token' });
  }
  if (!device_name || typeof device_name !== 'string') {
    return res.status(400).json({ error: 'missing_device_name' });
  }
  const trimmedName = device_name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 100) {
    return res.status(400).json({ error: 'device_name_invalid_length' });
  }

  try {
    // 用用户 access_token 创建一个临时 supabase client(走用户身份)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    });

    // 调 issue_mcp_token(SECURITY DEFINER,会校验 auth.uid() 不能为 null)
    const { data, error } = await userClient.rpc('issue_mcp_token', {
      p_device_name: trimmedName,
    });

    if (error) {
      const msg = error.message;
      let userMsg = '授权失败,请重试';
      if (msg.includes('未登录')) userMsg = '登录已失效,请重新登录';
      if (msg.includes('5 台')) userMsg = '设备数已达上限(5 台),请先在桌面端吊销旧设备';
      if (msg.includes('device_name')) userMsg = '设备名不合法(1-100 字符)';
      return res.status(400).json({ error: 'issue_failed', message: userMsg });
    }

    if (!data || data.length === 0) {
      return res.status(500).json({ error: 'empty_response' });
    }

    const row = data[0] as {
      access_token: string;
      expires_at: string;
      device_id: string;
    };

    return res.status(200).json({
      mcp_token: row.access_token,
      expires_at: row.expires_at,
      device_id: row.device_id,
    });
  } catch (e) {
    // 兜底:任何意外都返 JSON
    return res.status(500).json({
      error: 'unexpected_error',
      message: (e as Error).message,
    });
  }
}
