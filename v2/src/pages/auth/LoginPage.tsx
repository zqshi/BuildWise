import type { FormEvent, RefObject } from "react";

type LoginPageProps = {
  loginAccount: string;
  loginPassword: string;
  showAccountError: boolean;
  showPasswordError: boolean;
  accountError: string;
  passwordError: string;
  accountRef: RefObject<HTMLInputElement>;
  passwordRef: RefObject<HTMLInputElement>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAccountChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onAccountBlur: () => void;
  onPasswordBlur: () => void;
};

export function LoginPage({
  loginAccount,
  loginPassword,
  showAccountError,
  showPasswordError,
  accountError,
  passwordError,
  accountRef,
  passwordRef,
  onSubmit,
  onAccountChange,
  onPasswordChange,
  onAccountBlur,
  onPasswordBlur
}: LoginPageProps) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>BuildWise 登录</h1>
        <p>请输入账号后继续进入仪表盘</p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="loginAccount">账号</label>
          <input
            ref={accountRef}
            id="loginAccount"
            type="text"
            autoComplete="username"
            value={loginAccount}
            onChange={(event) => onAccountChange(event.target.value)}
            onBlur={onAccountBlur}
            placeholder="请输入账号"
            className={showAccountError ? "error" : ""}
            aria-invalid={showAccountError}
            aria-describedby={showAccountError ? "loginAccountError" : undefined}
          />
          {showAccountError ? (
            <p id="loginAccountError" className="auth-error">
              {accountError}
            </p>
          ) : (
            <p className="auth-hint">账号可使用邮箱或用户名</p>
          )}
          <label htmlFor="loginPassword">密码</label>
          <input
            ref={passwordRef}
            id="loginPassword"
            type="password"
            autoComplete="current-password"
            value={loginPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
            onBlur={onPasswordBlur}
            placeholder="请输入密码"
            className={showPasswordError ? "error" : ""}
            aria-invalid={showPasswordError}
            aria-describedby={showPasswordError ? "loginPasswordError" : undefined}
          />
          {showPasswordError ? (
            <p id="loginPasswordError" className="auth-error">
              {passwordError}
            </p>
          ) : (
            <p className="auth-hint">请输入当前账户对应密码</p>
          )}
          <button type="submit" className="btn primary" disabled={!loginAccount.trim() || !loginPassword.trim()}>
            登录
          </button>
        </form>
      </section>
    </main>
  );
}
