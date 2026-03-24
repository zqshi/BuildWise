type LoginSocialSectionProps = {
  onRegisterClick: () => void;
};

type LoginBrandPanelProps = {
  onHomeClick: () => void;
};

export function LoginBrandPanel({ onHomeClick }: LoginBrandPanelProps) {
  return (
    <article className="auth-brand-panel">
      <div className="auth-brand-head">
        <button type="button" className="auth-brand-home" onClick={onHomeClick} aria-label="返回 BuildWise 官网">
          <span className="auth-brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M7 6a2 2 0 0 1 2-2h6v4H9a2 2 0 0 1-2-2Z" fill="currentColor" />
              <path d="M5 11a2 2 0 0 1 2-2h8v4H7a2 2 0 0 1-2-2Z" fill="currentColor" opacity=".84" />
              <path d="M9 14h10v2a4 4 0 0 1-4 4H9v-6Z" fill="currentColor" opacity=".68" />
            </svg>
          </span>
          BuildWise
        </button>
        <p className="auth-mini-badge">AI 原生软件交付工作台</p>
        <h1>
          业务人员直接推进
          <span>软件交付</span>
        </h1>
      </div>
      <p className="auth-brand-intro">上传需求文档，AI 自动完成分析、生成交付物、评估发布风险。全程对话式引导，不需要写代码，不需要等排期。</p>
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

export function LoginSocialSection({ onRegisterClick }: LoginSocialSectionProps) {
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
        还没有账号？
        <button type="button" className="auth-link-btn" onClick={onRegisterClick}>
          立即注册
        </button>
      </p>
      <div className="auth-footer-links">
        <button type="button" className="auth-link-btn">隐私政策</button>
        <button type="button" className="auth-link-btn">服务协议</button>
        <button type="button" className="auth-link-btn">联系我们</button>
      </div>
    </>
  );
}
