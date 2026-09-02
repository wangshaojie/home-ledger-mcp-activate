// POST /api/send-otp
// 流程:
//   1) 调 Supabase issue_activation_code(email) 拿 6 位 code
//   2) 用 Resend 发邮件给用户
//   3) 返 { ok: true, expires_at } (不返 code,避免暴露给前端)
//
// 入参: { email }
// 返: { ok, expires_at, sent_to }
//
// 安全:
//   - 邮箱必须已注册
//   - 60 秒内不能重复申请
//   - 邮件发送失败也返 ok:true,因为 code 已写入 DB,用户可以重发

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@240730.xyz';
const FROM_NAME = process.env.FROM_NAME ?? '家庭记账';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({
        error: 'server_misconfigured',
        message: 'SUPABASE_URL / SUPABASE_ANON_KEY 未配置',
      });
    }
    if (!RESEND_API_KEY) {
      return res.status(500).json({
        error: 'server_misconfigured',
        message: 'RESEND_API_KEY 未配置',
      });
    }

    const { email } = (req.body ?? {}) as { email?: string };
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'missing_email' });
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) 调 Supabase 生成 6 位 code
    const { data, error } = await supabase.rpc('issue_activation_code', {
      p_email: trimmedEmail,
    });

    if (error) {
      const msg = error.message;
      let userMsg = '发送失败,请稍后重试';
      if (msg.includes('邮箱未注册')) userMsg = '该邮箱未注册家庭记账账号';
      if (msg.includes('请求过于频繁')) userMsg = '请求过于频繁,请稍后再试';
      return res.status(400).json({ error: 'issue_failed', message: userMsg });
    }

    if (!data || data.length === 0) {
      return res.status(500).json({ error: 'empty_response' });
    }

    const row = data[0] as { rc_code: string; rc_expires_at: string };
    const code = row.rc_code;
    const expiresAt = row.rc_expires_at;

    // 2) 用 Resend 发邮件
    const resend = new Resend(RESEND_API_KEY);
    const sendResult = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: trimmedEmail,
      subject: '家庭记账 · MCP 激活验证码',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:20px;">
          <h2 style="color:#1a1a1a;margin:0 0 16px;">家庭记账 · MCP 激活</h2>
          <p style="color:#666;font-size:14px;margin:0 0 24px;">
            你正在激活 AI agent 设备访问你的家庭记账。验证码 5 分钟内有效。
          </p>
          <div style="background:#f5f5f5;padding:20px;border-radius:8px;text-align:center;margin:24px 0;">
            <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#667eea;font-family:monospace;">
              ${code}
            </div>
          </div>
          <p style="color:#999;font-size:12px;margin:24px 0 0;">
            如果不是你本人操作,请忽略此邮件。
          </p>
        </div>
      `,
      text: `家庭记账 · MCP 激活\n\n验证码: ${code}\n\n5 分钟内有效。如果不是你本人操作,请忽略。`,
    });

    if (sendResult.error) {
      console.error('[send-otp] Resend 错误:', JSON.stringify(sendResult.error));
      return res.status(500).json({
        error: 'email_send_failed',
        message: `邮件发送失败: ${sendResult.error.message ?? '未知错误'}`,
      });
    }

    return res.status(200).json({
      ok: true,
      expires_at: expiresAt,
      sent_to: trimmedEmail.replace(/(.{2}).*(@.*)/, '$1***$2'),
    });
  } catch (e) {
    // 兜底:任何意外都返 JSON,绝不返 HTML
    console.error('[send-otp] 未捕获异常:', (e as Error).stack ?? (e as Error).message);
    return res.status(500).json({
      error: 'unexpected_error',
      message: (e as Error).message,
    });
  }
}
