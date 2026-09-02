// ⚠️ DEPRECATED: 旧版用 Supabase Auth OTP,绕不开 4 封/小时限制,已废弃
// 新版走 /api/send-otp + /api/exchange(用 Resend 直接发邮件)

import type { NextApiRequest, NextApiResponse } from 'next';

export default function deprecated_stub(_req: NextApiRequest, res: NextApiResponse) {
  res.status(410).json({
    error: 'gone',
    message: '此端点已废弃,请使用 /api/send-otp + /api/exchange',
  });
}
