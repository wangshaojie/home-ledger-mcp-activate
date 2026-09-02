// 激活页 - 4 步流程
// 1) 输入邮箱 → 收 6 位 OTP
// 2) 输入 OTP → 登录
// 3) 输入设备名 → 点授权
// 4) 拿 mcp_token → 复制 → 跑 home-ledger-mcp login

import { useEffect, useState } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Step = 'email' | 'otp' | 'device' | 'token' | 'error';

interface IssuedToken {
  mcp_token: string;
  expires_at: string;
  device_id: string;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '32px',
    maxWidth: '480px',
    width: '100%',
    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
  },
  h1: { margin: '0 0 8px', fontSize: '24px', color: '#1a1a1a' },
  sub: { margin: '0 0 24px', color: '#666', fontSize: '14px' },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '15px',
    boxSizing: 'border-box',
    marginBottom: '12px',
  },
  btn: {
    width: '100%',
    padding: '12px',
    background: '#667eea',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDisabled: { background: '#aaa', cursor: 'not-allowed' },
  error: {
    color: '#d32f2f',
    fontSize: '13px',
    marginTop: '8px',
    padding: '8px 12px',
    background: '#ffebee',
    borderRadius: '4px',
  },
  tokenBox: {
    background: '#f5f5f5',
    padding: '12px',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '12px',
    wordBreak: 'break-all',
    border: '1px solid #ddd',
    margin: '12px 0',
  },
  step: { fontSize: '12px', color: '#999', marginBottom: '16px' },
  link: { color: '#667eea', textDecoration: 'none', fontSize: '13px' },
};

export default function ActivatePage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [copied, setCopied] = useState(false);
  // 客户端水合后才创建 Supabase client,避免 SSG 阶段因 env 缺失抛错
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setConfigError(true);
      return;
    }
    setSupabase(
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    );
  }, []);

  if (configError) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.h1}>配置错误</h1>
          <p style={styles.sub}>
            激活页未配置 Supabase 连接。请在 Vercel 项目设置里加
            <code> NEXT_PUBLIC_SUPABASE_URL </code>和
            <code> NEXT_PUBLIC_SUPABASE_ANON_KEY</code>。
          </p>
        </div>
      </div>
    );
  }

  if (!supabase) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={{ color: '#999', textAlign: 'center' }}>加载中...</p>
        </div>
      </div>
    );
  }

  const stepLabel: Record<Step, string> = {
    email: '第 1 步 / 共 4 步 · 输邮箱',
    otp: '第 2 步 / 共 4 步 · 输验证码',
    device: '第 3 步 / 共 4 步 · 设备名',
    token: '第 4 步 / 共 4 步 · 复制 token',
    error: '出错',
  };

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setStep('otp');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      if (error) throw error;
      setStep('device');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleIssueToken(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError('');
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session?.access_token) throw new Error('未登录,请重新登录');

      const resp = await fetch('/api/issue-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: session.access_token,
          device_name: deviceName,
        }),
      });

      // 调试:看真实响应
      const contentType = resp.headers.get('content-type') ?? '';
      const raw = await resp.text();
      console.log('[issue-token] status:', resp.status, 'content-type:', contentType, 'body:', raw.slice(0, 500));

      if (!contentType.includes('application/json')) {
        throw new Error(
          `后端返非 JSON (HTTP ${resp.status}, ${contentType})。请看 Vercel Runtime Logs。响应前 200 字: ${raw.slice(0, 200)}`,
        );
      }

      const json = JSON.parse(raw);
      if (!resp.ok) {
        throw new Error(json.message ?? json.error ?? `HTTP ${resp.status}`);
      }
      setIssued(json as IssuedToken);
      setStep('token');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.mcp_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError('复制失败,请手动选择复制');
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.h1}>家庭记账 · MCP 激活</h1>
        <p style={styles.sub}>把 AI agent 接入你的家庭记账账号</p>
        <div style={styles.step}>{stepLabel[step]}</div>

        {error && <div style={styles.error}>❌ {error}</div>}

        {step === 'email' && (
          <form onSubmit={handleSendOtp}>
            <input
              style={styles.input}
              type="email"
              placeholder="你的家庭记账邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button
              type="submit"
              style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
              disabled={loading}
            >
              {loading ? '发送中...' : '发送验证码'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <p style={{ fontSize: '13px', color: '#666' }}>
              验证码已发送到 <b>{email}</b>(5 分钟内有效)
            </p>
            <input
              style={styles.input}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="6 位数字"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              autoFocus
            />
            <button
              type="submit"
              style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
              disabled={loading || otp.length !== 6}
            >
              {loading ? '验证中...' : '登录'}
            </button>
            <p style={{ marginTop: '12px', fontSize: '13px' }}>
              <a
                style={styles.link}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setStep('email');
                }}
              >
                ← 换邮箱
              </a>
            </p>
          </form>
        )}

        {step === 'device' && (
          <form onSubmit={handleIssueToken}>
            <p style={{ fontSize: '13px', color: '#666' }}>
              给这个设备起个名(随便,如 "我的 Mavis"、"Cursor 笔记本")
            </p>
            <input
              style={styles.input}
              type="text"
              maxLength={100}
              placeholder="设备名"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              required
              autoFocus
            />
            <button
              type="submit"
              style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
              disabled={loading || !deviceName.trim()}
            >
              {loading ? '授权中...' : '授权并生成 token'}
            </button>
            <p style={{ marginTop: '12px', fontSize: '12px', color: '#999' }}>
              ⚠️ 一次性 token,生成后只显示一次
            </p>
          </form>
        )}

        {step === 'token' && issued && (
          <div>
            <p style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 600 }}>
              ✅ 授权成功!复制下面的 token:
            </p>
            <div style={styles.tokenBox}>{issued.mcp_token}</div>
            <button
              type="button"
              onClick={copyToken}
              style={{ ...styles.btn, ...(copied ? { background: '#2e7d32' } : {}) }}
            >
              {copied ? '✅ 已复制' : '复制到剪贴板'}
            </button>

            <p style={{ marginTop: '24px', fontSize: '13px', color: '#666' }}>
              <b>下一步:</b>回到终端,跑:
            </p>
            <pre
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
                overflow: 'auto',
              }}
            >
{`# 把上面复制的 token 粘贴到登录流程
home-ledger-mcp login
# 设备名: ${deviceName}
# access_token: (粘贴)`}
            </pre>

            <p style={{ marginTop: '12px', fontSize: '12px', color: '#999' }}>
              token 过期时间: {new Date(issued.expires_at).toLocaleString('zh-CN')}
              <br />
              设备 ID: <code>{issued.device_id}</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
