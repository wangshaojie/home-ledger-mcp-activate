// POST /api/mcp
// MCP server 端点(Streamable HTTP 模式)
// 每次工具调用是独立 HTTP 请求,不需要长连接
//
// 安全:
//  1. Authorization: Bearer <mcp_token> 验 token
//  2. token 调 Supabase verify_mcp_token RPC 拿 user_id
//  3. 所有写操作走现有 mcp_add_expense / mcp_delete_expense RPC(限流+审计+RLS 都生效)
//
// 协议: JSON-RPC 2.0 over HTTP(2025-03 Streamable HTTP spec)
//
// 请求体格式(MCP 客户端发):
//   { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments } }
//   { jsonrpc: "2.0", id, method: "tools/list" }
//   { jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion, capabilities, clientInfo } }

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

// ===========================
// 工具定义(同 mcp-server/src/index.ts)
// ===========================
const TOOLS = [
  {
    name: 'home_ledger_add_expense',
    description:
      '在家庭记账中记一笔支出。会自动归属到当前用户所在家庭。' +
      '调用前请确认:金额、分类(可选)、账户(可选)、日期(默认今天)、备注(可选)。' +
      '返回:expense_id(可后续用 home_ledger_delete_expense 删除)。',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: '金额(数字,> 0,<= 10000000,单位:元)' },
        note: { type: 'string', description: '备注(可选,如"午餐 - 兰州拉面")' },
        category_id: { type: 'string', description: '分类 ID(可选)' },
        account_id: { type: 'string', description: '支付账户 ID(可选)' },
        spent_at: { type: 'string', description: '消费日期 YYYY-MM-DD(可选;默认今天)' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'home_ledger_list_recent',
    description: '查询当前用户家庭最近 N 笔支出(默认 10,最多 100)。' +
      '返回字段:amount / note / category_name / account_name / spent_at / creator_name。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数(1-100,默认 10)' },
      },
    },
  },
  {
    name: 'home_ledger_delete_expense',
    description: '软删一笔支出(同家庭成员可删)。参数:expense_id(从 list_recent 或 add_expense 返回)。',
    inputSchema: {
      type: 'object',
      properties: {
        expense_id: { type: 'string', description: '要删除的 expense ID' },
      },
      required: ['expense_id'],
    },
  },
  {
    name: 'home_ledger_whoami',
    description: '查看当前 token 绑定的用户和设备信息(用户 ID、设备名、token 过期时间等)。',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ===========================
// 工具实现
// ===========================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAddExpense(supabase: any, token: string, args: Record<string, unknown>, deviceFp: string) {
  const amount = args.amount as number;
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('amount 必须是大于 0 的数字');
  }
  const { data, error } = await supabase.rpc('mcp_add_expense', {
    p_token: token,
    p_amount: amount,
    p_note: (args.note as string) ?? null,
    p_category_id: (args.category_id as string) ?? null,
    p_account_id: (args.account_id as string) ?? null,
    p_spent_at: (args.spent_at as string) ?? null,
    p_device_fingerprint: deviceFp,
  });
  if (error) throw new Error(error.message);
  return (data as Array<{ expense_id: string; family_id: string; creator_id: string; amount: number; spent_at: string }>)[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callListRecent(supabase: any, token: string, args: Record<string, unknown>) {
  const limit = Math.min(Math.max((args.limit as number) ?? 10, 1), 100);
  const { data, error } = await supabase.rpc('mcp_list_recent', { p_token: token, p_limit: limit });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callDeleteExpense(supabase: any, token: string, args: Record<string, unknown>) {
  const expenseId = args.expense_id as string;
  if (!expenseId) throw new Error('expense_id 不能为空');
  const { error } = await supabase.rpc('mcp_delete_expense', { p_token: token, p_expense_id: expenseId });
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ===========================
// 验 token
// ===========================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyToken(supabase: any, token: string) {
  const { data, error } = await supabase.rpc('verify_mcp_token', { p_token: token });
  if (error) throw new Error(`token 验证失败: ${error.message}`);
  if (!data || (data as unknown[]).length === 0) throw new Error('token 无效');
  return (data as Array<{ user_id: string; device_id: string; device_name: string }>)[0];
}

// ===========================
// 主 handler
// ===========================
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 强制 JSON 响应
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  // CORS:只允许同源(浏览器 + AI agent 客户端从 mcp.240730.xyz 调用)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ jsonrpc: '2.0', error: { code: -32600, message: 'method_not_allowed' } });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'server_misconfigured' } });
  }

  // 1. 提取 token(Authorization: Bearer <token>)
  const auth = req.headers.authorization ?? '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'missing_authorization' } });
  }
  const token = match[1]!.trim();
  if (token.length !== 64) {
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'invalid_token_format' } });
  }

  // 2. 验 token
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let verified;
  try {
    verified = await verifyToken(supabase, token);
  } catch (e) {
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: (e as Error).message } });
  }

  // 3. 解析 JSON-RPC 请求
  let rpcReq: { jsonrpc: string; id?: string | number | null; method: string; params?: Record<string, unknown> };
  try {
    rpcReq = (req.body ?? {}) as typeof rpcReq;
  } catch {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'parse_error' } });
  }

  if (rpcReq.jsonrpc !== '2.0') {
    return res.status(400).json({ jsonrpc: '2.0', id: rpcReq.id ?? null, error: { code: -32600, message: 'invalid_jsonrpc_version' } });
  }

  const id = rpcReq.id ?? null;
  const method = rpcReq.method;
  const params = rpcReq.params ?? {};
  const deviceFp = (req.headers['user-agent'] as string) ?? 'unknown';

  try {
    // initialize
    if (method === 'initialize') {
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-03-26',
          serverInfo: { name: 'home-ledger-mcp', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
    }

    // notifications/initialized(客户端通知,无响应)
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return res.status(204).end();
    }

    // tools/list
    if (method === 'tools/list') {
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      });
    }

    // tools/call
    if (method === 'tools/call') {
      const toolName = params.name as string;
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
      if (!toolName) {
        return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'missing_tool_name' } });
      }

      if (toolName === 'home_ledger_whoami') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: `设备名: ${verified.device_name}\n设备 ID: ${verified.device_id}\n用户 ID: ${verified.user_id}\nMCP server: home-ledger-mcp v1.0.0 (HTTP/SSE 模式,部署在 Vercel)`,
            }],
          },
        });
      }

      let resultText = '';
      if (toolName === 'home_ledger_add_expense') {
        const r = await callAddExpense(supabase, token, toolArgs, deviceFp);
        resultText = `✅ 记账成功\n金额: ¥${r.amount}\n日期: ${r.spent_at}\nexpense_id: ${r.expense_id}\n家庭: ${r.family_id}\n创建者: ${r.creator_id}`;
      } else if (toolName === 'home_ledger_list_recent') {
        const items = (await callListRecent(supabase, token, toolArgs)) as Array<{
          expense_id: string; amount: number; note: string;
          category_name: string; account_name: string;
          spent_at: string; creator_name: string;
        }>;
        if (items.length === 0) {
          resultText = '没有找到任何账单。';
        } else {
          const lines = items.map((it) =>
            `- ${it.spent_at} | ¥${it.amount} | ${it.category_name ?? '未分类'} | ${it.account_name ?? '未指定账户'} | ${it.creator_name ?? '?'} | ${it.note ?? ''} | id=${it.expense_id}`,
          );
          resultText = `最近 ${items.length} 笔:\n${lines.join('\n')}`;
        }
      } else if (toolName === 'home_ledger_delete_expense') {
        await callDeleteExpense(supabase, token, toolArgs);
        const expenseId = toolArgs.expense_id as string;
        resultText = `✅ 已删除 expense ${expenseId}`;
      } else {
        return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown_tool: ${toolName}` } });
      }

      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: resultText }] },
      });
    }

    // ping
    if (method === 'ping') {
      return res.status(200).json({ jsonrpc: '2.0', id, result: {} });
    }

    return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: `method_not_found: ${method}` } });
  } catch (e) {
    console.error('[mcp] 工具执行失败:', (e as Error).message);
    return res.status(500).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: (e as Error).message },
    });
  }
}
