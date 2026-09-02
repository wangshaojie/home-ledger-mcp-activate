// POST /api/exchange
// 流程: 验 OTP + 创建设备 + 返 mcp_token
// 入参: { email, code, device_name }
// 返: { mcp_token, expires_at, device_id }

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

  const { email, code, device_name } = (req.body ?? {}) as {
    email?: string;
    code?: string;
    device_name?: string;
  };

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'missing_email' });
  }
  if (!code || typeof code !== 'string' || code.length !== 6 || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'invalid_code' });
  }
  if (!device_name || typeof device_name !== 'string') {
    return res.status(400).json({ error: 'missing_device_name' });
  }
  if (device_name.trim().length === 0 || device_name.length > 100) {
    return res.status(400).json({ error: 'device_name_invalid_length' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 调 exchange_activation_for_mcp_token(验 OTP + 创建设备 + 返 mcp_token)
  const { data, error } = await supabase.rpc('exchange_activation_for_mcp_token', {
    p_email: email.trim().toLowerCase(),
    p_code: code,
    p_device_name: device_name,
  });

  if (error) {
    const msg = error.message;
    let userMsg = '授权失败,请重试';
    if (msg.includes('邮箱未注册')) userMsg = '该邮箱未注册';
    if (msg.includes('验证码错误') || msg.includes('已过期')) userMsg = msg;
    if (msg.includes('5 台')) userMsg = '设备数已达上限(5 台),请先在桌面端吊销旧设备';
    if (msg.includes('设备名')) userMsg = '设备名不合法(1-100 字符)';
    return res.status(400).json({ error: 'exchange_failed', message: userMsg });
  }

  if (!data || data.length === 0) {
    return res.status(500).json({ error: 'empty_response' });
  }

  const row = data[0] as {
    rc_mcp_token: string;
    rc_expires_at: string;
    rc_device_id: string;
    rc_user_id: string;
  };

  return res.status(200).json({
    mcp_token: row.rc_mcp_token,
    expires_at: row.rc_expires_at,
    device_id: row.rc_device_id,
  });
}
