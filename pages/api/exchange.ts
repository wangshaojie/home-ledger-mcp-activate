// ⚠️ DEPRECATED: 已拆成 verify-otp + create-device 两个端点
// 此文件保留只为不破坏旧引用,实际不再被调用

import type { NextApiRequest, NextApiResponse } from 'next';

export default function deprecated_exchange(_req: NextApiRequest, res: NextApiResponse) {
  res.status(410).json({
    error: 'gone',
    message: '此端点已废弃,请使用 /api/verify-otp + /api/create-device',
  });
}
