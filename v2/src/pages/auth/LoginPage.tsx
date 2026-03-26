import { useEffect, useState, type FormEvent, type RefObject } from "react";
import { getLoginModeCopy, shouldShowRequestCodeButton, type LoginMode } from "../../app/authLoginMode";
import { LoginBrandPanel, LoginSocialSection } from "./loginPageSections";

type LoginPageProps = {
  loginMode: LoginMode;
  loginPhone: string;
  loginCode: string;
  showPhoneError: boolean;
  showCodeError: boolean;
  phoneError: string;
  codeError: string;
  loginError: string;
  debugCodeHint: string;
  sendingCode: boolean;
  countdown: number;
  phoneRef: RefObject<HTMLInputElement>;
  codeRef: RefObject<HTMLInputElement>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchMode: (mode: LoginMode) => void;
  onRequestCode: () => void;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onPhoneBlur: () => void;
  onCodeBlur: () => void;
};

export function LoginPage({
  loginMode,
  loginPhone,
  loginCode,
  showPhoneError,
  showCodeError,
  phoneError,
  codeError,
  loginError,
  debugCodeHint,
  sendingCode,
  countdown,
  phoneRef,
  codeRef,
  onSubmit,
  onSwitchMode,
  onRequestCode,
  onPhoneChange,
  onCodeChange,
  onPhoneBlur,
  onCodeBlur
}: LoginPageProps) {
  const copy = getLoginModeCopy(loginMode);
  const isSmsMode = loginMode === "sms";
  const showRequestCodeButton = shouldShowRequestCodeButton(loginMode);
  const [actionToast, setActionToast] = useState("");

  useEffect(() => {
    if (!actionToast) {
      return;
    }
    const timer = window.setTimeout(() => setActionToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [actionToast]);

  const showUnavailableToast = () => {
    setActionToast("暂未开放");
  };

  return (
    <main className="auth-page">
      <div className="auth-backdrop" aria-hidden="true" />
      <section className="auth-layout">
        <LoginBrandPanel onHomeClick={() => {
          window.location.hash = "/";
        }}
        />

        <section className="auth-card" aria-label="登录表单">
          {actionToast ? (
            <div className="auth-inline-toast" role="status" aria-live="polite">
              <span>{actionToast}</span>
            </div>
          ) : null}
          <div className="auth-mobile-brand" aria-hidden="true">
            <span className="auth-mobile-logo">BW</span>
            <span>BuildWise</span>
          </div>
          <h2>欢迎回来</h2>
          <p>登录您的 BuildWise 账号以继续</p>
          <div className="auth-login-switch" role="tablist" aria-label="登录方式">
            <button
              type="button"
              className={loginMode === "account" ? "active" : ""}
              role="tab"
              aria-selected={loginMode === "account"}
              onClick={() => onSwitchMode("account")}
            >
              账号登录
            </button>
            <button
              type="button"
              className={isSmsMode ? "active" : ""}
              role="tab"
              aria-selected={isSmsMode}
              onClick={() => onSwitchMode("sms")}
            >
              手机验证码
            </button>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            <label htmlFor="loginPhone">{copy.phoneLabel}</label>
            <div className="auth-input-wrap">
              <span className="auth-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <input
                ref={phoneRef}
                id="loginPhone"
                type="text"
                autoComplete="username"
                value={loginPhone}
                onChange={(event) => onPhoneChange(event.target.value)}
                onBlur={onPhoneBlur}
                placeholder={copy.phonePlaceholder}
                className={showPhoneError ? "error" : ""}
                aria-invalid={showPhoneError}
                aria-describedby={showPhoneError ? "loginPhoneError" : undefined}
              />
            </div>
            {showPhoneError ? (
              <p id="loginPhoneError" className="auth-error auth-field-feedback-tight">
                {phoneError}
              </p>
            ) : (
              <p className="auth-hint auth-placeholder-hint auth-field-feedback-tight" aria-hidden="true">
                &nbsp;
              </p>
            )}
            <label htmlFor="loginCode">{copy.codeLabel}</label>
            {showRequestCodeButton ? (
              <div className="auth-code-row">
                <div className="auth-input-wrap">
                  <span className="auth-input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <input
                    ref={codeRef}
                    id="loginCode"
                    type="password"
                    autoComplete="current-password"
                    value={loginCode}
                    onChange={(event) => onCodeChange(event.target.value)}
                    onBlur={onCodeBlur}
                    placeholder={copy.codePlaceholder}
                    className={showCodeError ? "error" : ""}
                    aria-invalid={showCodeError}
                    aria-describedby={showCodeError ? "loginCodeError" : undefined}
                  />
                  <span className="auth-input-tail" aria-hidden="true">
                    ◉
                  </span>
                </div>
                <div className="chat-tools auth-code-entry">
                  <button
                    type="button"
                    className="btn ghost mini"
                    onClick={onRequestCode}
                    disabled={sendingCode || countdown > 0}
                  >
                    {sendingCode ? "发送中..." : countdown > 0 ? `${countdown}s后重试` : "发送验证码"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="auth-input-wrap">
                <span className="auth-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <input
                  ref={codeRef}
                  id="loginCode"
                  type="password"
                  autoComplete="current-password"
                  value={loginCode}
                  onChange={(event) => onCodeChange(event.target.value)}
                  onBlur={onCodeBlur}
                  placeholder={copy.codePlaceholder}
                  className={showCodeError ? "error" : ""}
                  aria-invalid={showCodeError}
                  aria-describedby={showCodeError ? "loginCodeError" : undefined}
                />
                <span className="auth-input-tail" aria-hidden="true">
                  {showRequestCodeButton ? (
                    "◉"
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M2.4 12s3.2-6 9.6-6 9.6 6 9.6 6-3.2 6-9.6 6-9.6-6-9.6-6Zm9.6 3.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </span>
              </div>
            )}
            {showCodeError ? (
              <p id="loginCodeError" className="auth-error">
                {codeError}
              </p>
            ) : (
              <p className="auth-hint auth-placeholder-hint">{debugCodeHint || "\u00a0"}</p>
            )}
            <div className="auth-form-tools">
              <label className="auth-remember-me">
                <input type="checkbox" />
                <span>记住我</span>
              </label>
              {isSmsMode ? null : (
                <button type="button" className="auth-link-btn" onClick={showUnavailableToast}>
                  忘记密码？
                </button>
              )}
            </div>
            {loginError ? <p className="auth-error">{loginError}</p> : null}
            <button type="submit" className="btn primary" disabled={!loginPhone.trim() || !loginCode.trim()}>
              {copy.submitText}
            </button>
          </form>
          <LoginSocialSection onRegisterClick={showUnavailableToast} />
        </section>
      </section>
    </main>
  );
}
