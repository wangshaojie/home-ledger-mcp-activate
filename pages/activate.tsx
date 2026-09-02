// 激活页 - 3 步流程(走 Resend,绕开 Supabase 4 封/小时限制)
// 1) 输邮箱 → 发送激活邮件
// 2) 输 6 位 OTP → 验证
// 3) 输设备名 → 拿 mcp_token

import { useState } from 'react';

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
    wordBreak: 'break-word' as const,
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
  ok: {
    color: '#2e7d32',
    fontSize: '13px',
    marginTop: '8px',
    padding: '8px 12px',
    background: '#e8f5e9',
    borderRadius: '4px',
  },
};

export default function ActivatePage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [issued, setIssued] = useState<IssuedToken | null>(null);
  const [copied, setCopied] = useState(false);

  const stepLabel: Record<Step, string> = {
    email: '第 1 步 / 共 3 步 · 邮箱',
    otp: '第 2 步 / 共 3 步 · 验证码',
    device: '第 3 步 / 共 3 步 · 设备名',
    token: '完成',
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
      let json: { ok?: boolean; error?: string; message?: string } = {};
      try { json = JSON.parse(raw); } catch {}
      if (!resp.ok) {
        throw new Error(json.message ?? json.error ?? `HTTP ${resp.status}`);
      }
      setInfo('邮件已发送,请查收');
      setStep('otp');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      const raw = await resp.text();
      let json: { user_id?: string; email?: string; error?: string; message?: string; raw?: string } = {};
      try { json = JSON.parse(raw); } catch {}
      if (!resp.ok) {
        const detail = json.raw ? ` [${json.raw}]` : '';
        throw new Error(`${json.message ?? json.error ?? `HTTP ${resp.status}`}${detail}`);
      }
      setUserId(json.user_id ?? '');
      setInfo('✓ 验证码正确');
      setStep('device');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDevice(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/create-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          email,
          code: otp,
          device_name: deviceName,
        }),
      });
      const raw = await resp.text();
      let json: IssuedToken & { error?: string; message?: string; raw?: string } = {} as never;
      try { json = JSON.parse(raw); } catch {}
      if (!resp.ok) {
        const detail = json.raw ? ` [${json.raw}]` : '';
        throw new Error(`${json.message ?? json.error ?? `HTTP ${resp.status}`}${detail}`);
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

  // 不同 AI agent 客户端的 mcp.json 配置
  const mcpUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : 'https://mcp.240730.xyz/api/mcp';
  const mcpConfigCursor = `{
  "mcpServers": {
    "home-ledger": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${issued?.mcp_token ?? '<粘贴你的 mcp_token>'}"
      }
    }
  }
}`;
  const mcpConfigClaude = `{
  "mcpServers": {
    "home-ledger": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${issued?.mcp_token ?? '<粘贴你的 mcp_token>'}"
      }
    }
  }
}`;
  const mcpConfigGeneric = `{
  "mcpServers": {
    "home-ledger": {
      "url": "${mcpUrl}",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${issued?.mcp_token ?? '<粘贴你的 mcp_token>'}"
      }
    }
  }
}`;

  const [clientTab, setClientTab] = useState<'cursor' | 'claude' | 'generic'>('cursor');
  const [copiedConfig, setCopiedConfig] = useState(false);
  const clientConfigs: Record<typeof clientTab, { name: string; config: string; doc: string }> = {
    cursor: { name: 'Cursor', config: mcpConfigCursor, doc: '粘贴到 ~/.cursor/mcp.json 后重启 Cursor' },
    claude: { name: 'Claude Desktop', config: mcpConfigClaude, doc: '粘贴到 ~/Library/Application Support/Claude/claude_desktop_config.json(Windows: %APPDATA%\\Claude\\)后重启' },
    generic: { name: '其他 (Mavis / WorkBuddy / Codex 等)', config: mcpConfigGeneric, doc: '不同客户端配置位置不同,参考各客户端文档' },
  };
  async function copyConfig() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(clientConfigs[clientTab].config);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
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
        {info && !error && <div style={styles.ok}>{info}</div>}

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
          <form onSubmit={handleVerifyOtp}>
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
            <button
              type="submit"
              style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }}
              disabled={loading || otp.length !== 6}
            >
              {loading ? '验证中...' : '验证'}
            </button>
            <p style={{ marginTop: '12px', fontSize: '13px' }}>
              <a
                style={styles.link}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setStep('email');
                  setOtp('');
                  setInfo('');
                  setError('');
                }}
              >
                ← 换邮箱
              </a>
            </p>
          </form>
        )}

        {step === 'device' && (
          <form onSubmit={handleCreateDevice}>
            <p style={{ fontSize: '13px', color: '#2e7d32' }}>✓ 验证码通过</p>
            <input
              style={styles.input}
              type="text"
              maxLength={100}
              placeholder='设备名(例:"我的 Mavis"、"Cursor 笔记本")'
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
            <p style={{ marginTop: '12px', fontSize: '13px' }}>
              <a
                style={styles.link}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setStep('otp');
                  setDeviceName('');
                  setError('');
                }}
              >
                ← 改验证码
              </a>
            </p>
          </form>
        )}

        {step === 'token' && issued && (
          <div>
            <p style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 600 }}>
              ✅ 授权成功!零安装接入 AI agent
            </p>

            <p style={{ fontSize: '13px', color: '#666', marginTop: '12px' }}>
              选你的 AI agent,复制下面的配置粘贴进去:
            </p>

            {/* Client tabs */}
            <div style={{ display: 'flex', gap: '4px', marginTop: '12px', marginBottom: '8px' }}>
              {(Object.keys(clientConfigs) as Array<keyof typeof clientConfigs>).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setClientTab(k)}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    fontSize: '12px',
                    background: clientTab === k ? '#667eea' : '#f0f0f0',
                    color: clientTab === k ? '#fff' : '#666',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: clientTab === k ? 600 : 400,
                  }}
                >
                  {clientConfigs[k].name}
                </button>
              ))}
            </div>

            <pre
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '12px',
                overflow: 'auto',
                margin: 0,
                whiteSpace: 'pre-wrap' as const,
                wordBreak: 'break-all' as const,
              }}
            >
{clientConfigs[clientTab].config}
            </pre>

            <button
              type="button"
              onClick={copyConfig}
              style={{ ...styles.btn, marginTop: '8px', ...(copiedConfig ? { background: '#2e7d32' } : {}) }}
            >
              {copiedConfig ? '✅ 已复制' : '复制配置'}
            </button>

            <p style={{ marginTop: '8px', fontSize: '11px', color: '#999' }}>
              {clientConfigs[clientTab].doc}
            </p>

            <details style={{ marginTop: '20px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#666' }}>
                🔧 高级:手动复制 token
              </summary>
              <div style={styles.tokenBox}>{issued.mcp_token}</div>
              <button
                type="button"
                onClick={copyToken}
                style={{ ...styles.btn, ...(copied ? { background: '#2e7d32' } : {}) }}
              >
                {copied ? '✅ 已复制' : '复制 token'}
              </button>
            </details>

            <p style={{ marginTop: '20px', fontSize: '11px', color: '#999' }}>
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
