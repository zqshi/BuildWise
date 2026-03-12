export function LoginBrandPanel() {
  return (
    <article className="auth-brand-panel">
      <div className="auth-brand-head">
        <p className="auth-brand-title">
          <span className="auth-brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7 6a2 2 0 0 1 2-2h6v4H9a2 2 0 0 1-2-2Z" fill="currentColor" />
              <path d="M5 11a2 2 0 0 1 2-2h8v4H7a2 2 0 0 1-2-2Z" fill="currentColor" opacity=".84" />
              <path d="M9 14h10v2a4 4 0 0 1-4 4H9v-6Z" fill="currentColor" opacity=".68" />
            </svg>
          </span>
          BuildWise
        </p>
        <p className="auth-mini-badge">Next Generation Enterprise Delivery</p>
        <h1>
          将业务意图编译为
          <span>可运行软件</span>
        </h1>
      </div>
      <p className="auth-brand-intro">AI 驱动的企业级交付工作台，重塑软件开发全生命周期。</p>
      <div className="auth-hero-mock" aria-hidden="true">
        <div className="auth-hero-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="auth-hero-lines">
          <i />
          <i />
        </div>
        <div className="auth-hero-grid">
          <b className="active" />
          <b />
          <b />
        </div>
      </div>
    </article>
  );
}

export function LoginSocialSection() {
  return (
    <>
      <div className="auth-divider" role="separator" aria-label="其他登录方式">
        <span>其他方式登录</span>
      </div>
      <div className="auth-social-grid">
        <button type="button" className="auth-social-btn" aria-label="方式一">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 4.5 13.8 9l4.7 1.9-4.7 1.9L12 17.5l-1.8-4.7-4.7-1.9L10.2 9 12 4.5Z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="auth-social-btn" aria-label="方式二">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8A1.5 1.5 0 0 1 17.5 16h-5.3l-2.7 2.7V16H6.5A1.5 1.5 0 0 1 5 14.5v-8Z"
              fill="currentColor"
            />
          </svg>
        </button>
        <button type="button" className="auth-social-btn" aria-label="方式三">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="m12 4 6.5 2.6v4.4c0 4.2-2.6 8-6.5 9-3.9-1-6.5-4.8-6.5-9V6.6L12 4Z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <p className="auth-register-hint">
        还没有账号？<button type="button" className="auth-link-btn">立即注册</button>
      </p>
      <div className="auth-footer-links">
        <button type="button" className="auth-link-btn">隐私政策</button>
        <button type="button" className="auth-link-btn">服务协议</button>
        <button type="button" className="auth-link-btn">联系我们</button>
      </div>
    </>
  );
}
