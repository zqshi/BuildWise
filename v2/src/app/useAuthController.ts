import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { resolveAppRoute, type AppRoute } from "./authRouting";
import { requestSmsLoginCode, verifySmsLoginCode, logoutSession } from "./workspaceApi";
import { getDefaultLoginMode, getLoginModeSubmitError, type LoginMode } from "./authLoginMode";
import { saveTokens, clearTokens } from "../infrastructure/auth/tokenStore";
import { ensureFreshToken } from "../infrastructure/auth/tokenRefresh";

export function useAuthController() {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute(window.location.hash));
  // Only check the persistent auth flag — the in-memory access token will be
  // restored via refresh cookie in the useEffect below.
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem("buildwise:auth") === "logged_in"
  );
  const [loginPhone, setLoginPhone] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginTouched, setLoginTouched] = useState<{ phone: boolean; code: boolean }>({
    phone: false,
    code: false
  });
  const [loginSubmitted, setLoginSubmitted] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loginError, setLoginError] = useState("");
  const [debugCodeHint, setDebugCodeHint] = useState("");
  const [loginMode, setLoginMode] = useState<LoginMode>(getDefaultLoginMode);
  const [workspaceRole, setWorkspaceRole] = useState<"owner" | "pm" | "developer" | "qa" | "viewer">(() => {
    const cached = localStorage.getItem("buildwise:auth-role");
    return cached === "owner" || cached === "pm" || cached === "developer" || cached === "qa" || cached === "viewer"
      ? cached
      : "viewer";
  });
  const loginPhoneRef = useRef<HTMLInputElement | null>(null);
  const loginCodeRef = useRef<HTMLInputElement | null>(null);

  // On page load, if the persistent auth flag says "logged_in" but the
  // in-memory access token is gone (page refresh), silently re-acquire
  // the token via the httpOnly refresh cookie.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    ensureFreshToken().then((ok) => {
      if (cancelled) return;
      if (!ok) {
        // Refresh cookie expired or invalid — force re-login
        clearTokens();
        localStorage.setItem("buildwise:auth", "logged_out");
        localStorage.removeItem("buildwise:auth-role");
        setIsAuthenticated(false);
        setWorkspaceRole("viewer");
        window.location.hash = "/login";
      }
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveAppRoute(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // 未认证时不再强制修改 hash — App.tsx 的 isMarketingRoute 会自动渲染营销首页
  // 保留原始 hash，登录后可以回到目标页面

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    const handleExpired = () => {
      clearTokens();
      localStorage.setItem("buildwise:auth", "logged_out");
      localStorage.removeItem("buildwise:auth-role");
      setIsAuthenticated(false);
      setWorkspaceRole("viewer");
      window.location.hash = "/login";
    };
    window.addEventListener("buildwise:auth-expired", handleExpired);
    return () => window.removeEventListener("buildwise:auth-expired", handleExpired);
  }, []);

  const handleRequestCode = async () => {
    const phone = loginPhone.trim();
    if (!/^1\d{10}$/.test(phone)) {
      setLoginTouched((prev) => ({ ...prev, phone: true }));
      loginPhoneRef.current?.focus();
      return;
    }
    try {
      setSendingCode(true);
      setLoginError("");
      const result = await requestSmsLoginCode(phone);
      setCountdown(60);
      setDebugCodeHint(import.meta.env.DEV && result.debugCode ? `测试验证码：${result.debugCode}` : "");
      if (import.meta.env.DEV && result.debugCode) {
        setLoginCode(result.debugCode);
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "验证码发送失败");
    } finally {
      setSendingCode(false);
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const modeError = getLoginModeSubmitError(loginMode);
    if (modeError) {
      setLoginError(modeError);
      return;
    }
    setLoginSubmitted(true);
    if (!/^1\d{10}$/.test(loginPhone.trim())) {
      loginPhoneRef.current?.focus();
      return;
    }
    if (!/^\d{6}$/.test(loginCode.trim())) {
      loginCodeRef.current?.focus();
      return;
    }
    try {
      setLoginError("");
      const result = await verifySmsLoginCode(loginPhone.trim(), loginCode.trim());
      if (result.accessToken && result.expiresIn) {
        saveTokens(result.accessToken, result.expiresIn);
      }
      const role = result.user.workspaceRole;
      localStorage.setItem("buildwise:auth", "logged_in");
      localStorage.setItem("buildwise:auth-role", role);
      setWorkspaceRole(role);
      window.dispatchEvent(new CustomEvent("buildwise:auth-role-updated", { detail: { role } }));
      setIsAuthenticated(true);
      setLoginCode("");
      setLoginTouched({ phone: false, code: false });
      setLoginSubmitted(false);
      // If user was trying to access a workspace route before login, restore it
      const currentHash = window.location.hash;
      const targetRoute = resolveAppRoute(currentHash);
      if (targetRoute === "workspace") {
        // Already on a workspace hash (e.g. #/dashboard) — just stay
        setRoute(targetRoute);
      } else {
        localStorage.setItem("buildwise:active-view", "dashboard");
        window.location.hash = "/dashboard";
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    }
  };

  const logout = () => {
    const confirmed = window.confirm("确认退出登录吗？");
    if (!confirmed) {
      return false;
    }
    // Fire-and-forget: clear httpOnly cookie on server
    logoutSession().catch(() => {});
    clearTokens();
    localStorage.setItem("buildwise:auth", "logged_out");
    localStorage.removeItem("buildwise:userAvatar");
    localStorage.removeItem("buildwise:auth-phone");
    localStorage.removeItem("buildwise:auth-role");
    setIsAuthenticated(false);
    setWorkspaceRole("viewer");
    window.location.hash = "/login";
    return true;
  };

  const phoneError = !loginPhone.trim() ? "请输入手机号" : !/^1\d{10}$/.test(loginPhone.trim()) ? "请输入11位手机号" : "";
  const codeError = !loginCode.trim() ? "请输入验证码" : !/^\d{6}$/.test(loginCode.trim()) ? "验证码应为6位数字" : "";
  const showPhoneError = (loginTouched.phone || loginSubmitted) && Boolean(phoneError);
  const showCodeError = (loginTouched.code || loginSubmitted) && Boolean(codeError);

  return {
    route,
    isAuthenticated,
    workspaceRole,
    loginPhone,
    setLoginPhone,
    loginCode,
    setLoginCode,
    loginTouched,
    setLoginTouched,
    showPhoneError,
    showCodeError,
    phoneError,
    codeError,
    loginError,
    loginMode,
    setLoginMode,
    debugCodeHint,
    sendingCode,
    countdown,
    loginPhoneRef,
    loginCodeRef,
    handleRequestCode,
    handleLogin,
    logout
  };
}
