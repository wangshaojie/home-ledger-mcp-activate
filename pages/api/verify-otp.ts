// POST /api/verify-otp
// 验 OTP,返 user_id(前端暂存,下一步 create-device 用)
// 不消费 code(create-device 才会消费,允许 verify 后用户取消)
//
// 入参: { email, code }
// 返: { user_id, email }

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({
      error: 'server_misconfigured',
      message: 'SUPABASE_URL / SUPABASE_ANON_KEY 未配置',
    });
  }

  const { email, code } = (req.body ?? {}) as { email?: string; code?: string };

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'missing_email' });
  }
  if (!code || typeof code !== 'string' || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'invalid_code' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('verify_activation_code', {
    p_email: email.trim().toLowerCase(),
    p_code: code,
  });

  if (error) {
    const msg = error.message;
    console.error('[verify-otp] Supabase RPC 错误:', msg);
    let userMsg = `验证失败: ${msg}`;
    if (msg.includes('邮箱未注册')) userMsg = '该邮箱未注册';
    if (msg.includes('验证码错误') || msg.includes('已过期')) userMsg = '验证码错误或已过期(检查是否输错,或重新申请)';
    return res.status(400).json({ error: 'verify_failed', message: userMsg, raw: msg });
  }

  if (!data || data.length === 0) {
    return res.status(500).json({ error: 'empty_response' });
  }

  const row = data[0] as { rc_user_id: string; rc_email: string };

  return res.status(200).json({
    user_id: row.rc_user_id,
    email: row.rc_email,
  });
}
