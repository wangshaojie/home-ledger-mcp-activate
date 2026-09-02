// 激活页 - 3 步流程(走 Resend,绕开 Supabase 4 封/小时限制)
// 1) 输邮箱 → 点发送 → Resend 发 6 位 OTP
// 2) 输 OTP + 设备名 → 点授权
// 3) 拿 mcp_token → 复制

import { useState } from 'react';

type Step = 'email' | 'otp' | 'token' | 'error';

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
    boxSizing: 'border-box' as const,
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
    wordBreak: 'break-all' as const,
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

  const stepLabel: Record<Step, string> = {
    email: '第 1 步 / 共 3 步 · 邮箱',
    otp: '第 2 步 / 共 3 步 · 验证码 + 设备名',
    token: '第 3 步 / 共 3 步 · 复制 token',
    error: '出错',
  };

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const raw = await resp.text();
      let json: { error?: string; message?: string } = {};
      try { json = JSON.parse(raw); } catch {}
      if (!resp.ok) {
        throw new Error(json.message ?? json.error ?? `HTTP ${resp.status}`);
      }
      setStep('otp');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExchange(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: otp,
          device_name: deviceName,
        }),
      });
      const raw = await resp.text();
      let json: IssuedToken & { error?: string; message?: string } = {} as never;
      try { json = JSON.parse(raw); } catch {}
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
    } catch {
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
              {loading ? '发送中...' : '发送激活邮件'}
            </button>
            <p style={{ marginTop: '12px', fontSize: '12px', color: '#999' }}>
              邮件由 noreply@240730.xyz 发送,5 分钟内有效
            </p>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleExchange}>
            <p style={{ fontSize: '13px', color: '#666' }}>
              验证码已发送到 <b>{email}</b>
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
            <input
              style={styles.input}
              type="text"
              maxLength={100}
              placeholder='设备名(例:"我的 Mavis"、"Cursor 笔记本")'
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              required
            />
            <button
              type="submit"
              style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
              disabled={loading || otp.length !== 6 || !deviceName.trim()}
            >
              {loading ? '授权中...' : '授权并生成 token'}
            </button>
            <p style={{ marginTop: '12px', fontSize: '13px' }}>
              <a
                style={styles.link}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setStep('email');
                  setOtp('');
                }}
              >
                ← 换邮箱
              </a>
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
{`# 粘贴复制的 token 到登录流程
home-ledger-mcp login
# 设备名: ${deviceName}
# access_token: (粘贴)`}
            </pre>

            <p style={{ marginTop: '12px', fontSize: '12px', color: '#999' }}>
              token 过期: {new Date(issued.expires_at).toLocaleString('zh-CN')}
              <br />
              设备 ID: <code>{issued.device_id}</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
