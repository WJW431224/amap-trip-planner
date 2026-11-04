import { useState, type FormEvent } from 'react';
import {
  readStoredCredentials,
  saveCredentials,
  validateCredentials,
} from '../config/credentials';
import { ArrowUpRight, Eye, EyeOff, RouteMark, ShieldCheck } from './Icons';

export default function SetupPage() {
  const stored = readStoredCredentials();
  const [key, setKey] = useState(stored?.key ?? '');
  const [securityCode, setSecurityCode] = useState(stored?.securityCode ?? '');
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = { key: key.trim(), securityCode: securityCode.trim() };
    const validationError = validateCredentials(input);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      saveCredentials(input);
      // 重新加载，确保高德 SDK 用新的 Key 和密钥重新初始化。
      window.location.reload();
    } catch {
      setError('浏览器禁止了本地存储。请允许本站使用 localStorage，或改用 .env.local 配置。');
    }
  }

  return (
    <div className="setup-shell">
      <aside className="setup-brand">
        <svg className="brand-route" viewBox="0 0 620 430" aria-hidden="true">
          <path
            d="M28 360c92-28 96-126 184-146s98 88 196 44 88-146 184-176"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="5 8"
          />
          <circle cx="28" cy="360" r="5" fill="currentColor" />
          <circle cx="212" cy="214" r="4" fill="currentColor" />
          <circle cx="408" cy="258" r="4" fill="currentColor" />
          <circle cx="592" cy="82" r="5" fill="currentColor" />
        </svg>

        <div className="brand-top">
          <span className="brand-mark">
            <RouteMark size={24} />
          </span>
          <span className="brand-word">行程标点</span>
        </div>

        <div className="brand-copy">
          <p className="eyebrow">AMAP TRIP PLANNER</p>
          <h1>
            先接上高德，
            <br />
            再开始标点。
          </h1>
          <p className="lede">
            这一步只做一件事：把「Web端(JS API)」的 Key 和安全密钥接进来。
            配置只存在这台电脑的浏览器里，不会上传到任何服务器。
          </p>
        </div>

        <ol className="setup-steps">
          <li>
            <span className="step-no">01</span>
            <div>
              <strong>登录高德开放平台</strong>
              <small>进入「应用管理 → 我的应用」</small>
            </div>
          </li>
          <li>
            <span className="step-no">02</span>
            <div>
              <strong>创建应用并添加 Key</strong>
              <small>服务平台一定选「Web端(JS API)」</small>
            </div>
          </li>
          <li>
            <span className="step-no">03</span>
            <div>
              <strong>复制 Key 与安全密钥</strong>
              <small>两个都复制，粘贴到配置表单</small>
            </div>
          </li>
        </ol>

        <a
          className="console-link"
          href="https://console.amap.com/dev/key/app"
          target="_blank"
          rel="noreferrer"
        >
          打开高德控制台
          <ArrowUpRight size={15} />
        </a>
      </aside>

      <main className="setup-main">
        <div className="setup-card">
          <div className="card-topline">
            <span className="status-pill">
              <span className="status-dot" />
              本地配置
            </span>
            <span className="soft-badge">第 1 步 / 共 2 步</span>
          </div>

          <h2>填入 Key 与安全密钥</h2>
          <p className="card-intro">
            保存后会刷新页面，直接进入地图工作区。高德地图能正常加载，就说明 Key
            和安全密钥配置成功了。
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span className="field-label">Key</span>
              <input
                type="text"
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                  setError(null);
                }}
                placeholder="粘贴 Web端(JS API) 的 Key"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
              />
            </label>

            <label className="field">
              <span className="field-label">安全密钥</span>
              <span className="secret-wrap">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={securityCode}
                  onChange={(event) => {
                    setSecurityCode(event.target.value);
                    setError(null);
                  }}
                  placeholder="粘贴对应的安全密钥（不是 Key 本身）"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                />
                <button
                  type="button"
                  className="secret-toggle"
                  onClick={() => setShowSecret((value) => !value)}
                  aria-label={showSecret ? '隐藏安全密钥' : '显示安全密钥'}
                >
                  {showSecret ? <EyeOff /> : <Eye />}
                </button>
              </span>
            </label>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : (
              <p className="form-note">
                <ShieldCheck size={15} />
                只保存在本机 localStorage，可随时在下一步里清除。
              </p>
            )}

            <button className="primary-button" type="submit">
              保存并进入地图
              <ArrowUpRight size={17} />
            </button>
          </form>

          <details className="help-details">
            <summary>找不到安全密钥？</summary>
            <div className="help-body">
              <p>
                在高德控制台的 Key 列表里，Key 右侧会有「安全密钥」一栏。点查看或复制，
                它和 Key 是两串不同的字符。
              </p>
              <p>
                如果你只看到 Key，没有安全密钥，通常是 Key 类型选错了：请重新添加一个
                「Web端(JS API)」的 Key。
              </p>
            </div>
          </details>

          <p className="privacy-line">
            不想存在浏览器里？也可以复制 <code>.env.example</code> 为{' '}
            <code>.env.local</code>，把两个值填进去后重启开发服务器。
          </p>
        </div>

        <p className="setup-foot">下一步 · 地图标点与多点路线规划</p>
      </main>
    </div>
  );
}
