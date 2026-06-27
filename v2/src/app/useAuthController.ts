import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { resolveAppRoute, type AppRoute } from "./authRouting";
import { fetchAuthSession, requestSmsLoginCode, verifySmsLoginCode, logoutSession } from "./workspaceApi";
import { getDefaultLoginMode, getLoginModeSubmitError, type LoginMode } from "./authLoginMode";
import { extractRetryAfterSeconds, formatSmsRateLimitMessage } from "./authRateLimit";
import { saveTokens, clearTokens } from "../infrastructure/auth/tokenStore";
import { ensureFreshToken } from "../infrastructure/auth/tokenRefresh";
import {
  clearAuthTenantSession,
  persistAuthTenants,
  persistCurrentTenantId,
  readStoredAuthTenants,
  readStoredCurrentTenantId,
  resolveCurrentTenant,
  resolveCurrentTenantId,
  type AuthTenantSummary
} from "../infrastructure/auth/tenantSession";

/* ── helpers ── */

function hadPriorSession(): boolean {
  try {
    return localStorage.getItem("buildwise:auth") === "logged_in";
  } catch {
    return false;
  }
}

function readCachedRole(): "owner" | "pm" | "developer" | "qa" | "viewer" {
  const cached = localStorage.getItem("buildwise:auth-role");
  return cached === "owner" || cached === "pm" || cached === "developer" || cached === "qa" || cached === "viewer"
    ? cached
    : "viewer";
}

/* ── types ── */

interface AuthSessionState {
  route: AppRoute;
  setRoute: (r: AppRoute) => void;
  isAuthenticated: boolean;
  setIsAuthenticated: (v: boolean) => void;
  sessionRestoring: boolean;
  setSessionRestoring: (v: boolean) => void;
  workspaceRole: "owner" | "pm" | "developer" | "qa" | "viewer";
  setWorkspaceRole: (r: "owner" | "pm" | "developer" | "qa" | "viewer") => void;
  tenants: AuthTenantSummary[];
  setTenants: (t: AuthTenantSummary[]) => void;
  currentTenantId: string;
  setCurrentTenantIdState: (id: string) => void;
}

interface AuthLoginFormState {
  loginPhone: string;
  setLoginPhone: (v: string) => void;
  loginCode: string;
  setLoginCode: (v: string) => void;
  loginTouched: { phone: boolean; code: boolean };
  setLoginTouched: (v: { phone: boolean; code: boolean } | ((prev: { phone: boolean; code: boolean }) => { phone: boolean; code: boolean })) => void;
  loginSubmitted: boolean;
  setLoginSubmitted: (v: boolean) => void;
  sendingCode: boolean;
  setSendingCode: (v: boolean) => void;
  countdown: number;
  setCountdown: (v: number | ((prev: number) => number)) => void;
  loginError: string;
  setLoginError: (v: string) => void;
  debugCodeHint: string;
  setDebugCodeHint: (v: string) => void;
  loginMode: LoginMode;
  setLoginMode: (v: LoginMode) => void;
  loginPhoneRef: React.RefObject<HTMLInputElement>;
  loginCodeRef: React.RefObject<HTMLInputElement>;
}

/* ── sub-hook: session state ── */

function useAuthSessionState(): AuthSessionState {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute(window.location.hash));
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionRestoring, setSessionRestoring] = useState(hadPriorSession);
  const [workspaceRole, setWorkspaceRole] = useState<"owner" | "pm" | "developer" | "qa" | "viewer">(readCachedRole);
  const [tenants, setTenants] = useState<AuthTenantSummary[]>(() => readStoredAuthTenants());
  const [currentTenantId, setCurrentTenantIdState] = useState(
    () => resolveCurrentTenantId(readStoredAuthTenants(), readStoredCurrentTenantId()),
  );

  return {
    route, setRoute,
    isAuthenticated, setIsAuthenticated,
    sessionRestoring, setSessionRestoring,
    workspaceRole, setWorkspaceRole,
    tenants, setTenants,
    currentTenantId, setCurrentTenantIdState,
  };
}

/* ── sub-hook: login form state ── */

function useAuthLoginFormState(): AuthLoginFormState {
  const [loginPhone, setLoginPhone] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginTouched, setLoginTouched] = useState<{ phone: boolean; code: boolean }>({
    phone: false,
    code: false,
  });
  const [loginSubmitted, setLoginSubmitted] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loginError, setLoginError] = useState("");
  const [debugCodeHint, setDebugCodeHint] = useState("");
  const [loginMode, setLoginMode] = useState<LoginMode>(getDefaultLoginMode);
  const loginPhoneRef = useRef<HTMLInputElement | null>(null);
  const loginCodeRef = useRef<HTMLInputElement | null>(null);

  return {
    loginPhone, setLoginPhone,
    loginCode, setLoginCode,
    loginTouched, setLoginTouched,
    loginSubmitted, setLoginSubmitted,
    sendingCode, setSendingCode,
    countdown, setCountdown,
    loginError, setLoginError,
    debugCodeHint, setDebugCodeHint,
    loginMode, setLoginMode,
    loginPhoneRef, loginCodeRef,
  };
}

/* ── sub-hook: core session callbacks (apply tenant, reset, refresh) ── */

function useAuthCoreActions(session: AuthSessionState) {
  const applyTenantSession = useCallback(
    (nextTenants: AuthTenantSummary[], requestedTenantId: string, fallbackRole = session.workspaceRole) => {
      const resolvedTenantId = resolveCurrentTenantId(nextTenants, requestedTenantId);
      const currentTenant = resolveCurrentTenant(nextTenants, resolvedTenantId);
      persistAuthTenants(nextTenants);
      persistCurrentTenantId(resolvedTenantId);
      session.setTenants(nextTenants);
      session.setCurrentTenantIdState(resolvedTenantId);
      session.setWorkspaceRole(currentTenant?.workspaceRole || fallbackRole);
      window.dispatchEvent(
        new CustomEvent("buildwise:auth-tenant-updated", {
          detail: { tenantId: resolvedTenantId, workspaceRole: currentTenant?.workspaceRole || fallbackRole },
        }),
      );
    },
    [session.workspaceRole, session.setTenants, session.setCurrentTenantIdState, session.setWorkspaceRole],
  );

  const resetAuthState = useCallback(() => {
    clearTokens();
    localStorage.setItem("buildwise:auth", "logged_out");
    localStorage.removeItem("buildwise:auth-phone");
    localStorage.removeItem("buildwise:auth-role");
    clearAuthTenantSession();
    session.setIsAuthenticated(false);
    session.setWorkspaceRole("viewer");
    window.location.hash = "/login";
  }, [session.setIsAuthenticated, session.setWorkspaceRole]);

  const refreshSession = useCallback(async () => {
    const ok = await ensureFreshToken();
    if (!ok) { resetAuthState(); return false; }
    const data = await fetchAuthSession();
    localStorage.setItem("buildwise:auth", "logged_in");
    localStorage.setItem("buildwise:auth-phone", data.user.phone);
    localStorage.setItem("buildwise:auth-role", data.user.workspaceRole);
    applyTenantSession(data.tenants, readStoredCurrentTenantId() || data.currentTenantId, data.user.workspaceRole);
    session.setIsAuthenticated(true);
    return true;
  }, [applyTenantSession, resetAuthState, session.setIsAuthenticated]);

  return { applyTenantSession, resetAuthState, refreshSession };
}

/* ── sub-hook: tenant switch + logout ── */

function useAuthUserActions(session: AuthSessionState) {
  const switchTenant = useCallback(
    (tenantId: string) => {
      const normalizedTenantId = resolveCurrentTenantId(session.tenants, tenantId);
      const nextTenant = resolveCurrentTenant(session.tenants, normalizedTenantId);
      persistCurrentTenantId(normalizedTenantId);
      session.setCurrentTenantIdState(normalizedTenantId);
      session.setWorkspaceRole(nextTenant?.workspaceRole || "viewer");
      localStorage.setItem("buildwise:auth-role", nextTenant?.workspaceRole || "viewer");
      window.dispatchEvent(
        new CustomEvent("buildwise:auth-tenant-updated", {
          detail: { tenantId: normalizedTenantId, workspaceRole: nextTenant?.workspaceRole || "viewer" },
        }),
      );
    },
    [session.tenants, session.setCurrentTenantIdState, session.setWorkspaceRole],
  );

  const logout = useCallback(() => {
    const confirmed = window.confirm("确认退出登录吗？");
    if (!confirmed) return false;
    logoutSession().catch((err) => {
      console.warn("[logout] server session cleanup failed:", err instanceof Error ? err.message : String(err));
    });
    clearTokens();
    localStorage.setItem("buildwise:auth", "logged_out");
    localStorage.removeItem("buildwise:userAvatar");
    localStorage.removeItem("buildwise:auth-phone");
    localStorage.removeItem("buildwise:auth-role");
    clearAuthTenantSession();
    session.setIsAuthenticated(false);
    session.setWorkspaceRole("viewer");
    window.location.hash = "/login";
    return true;
  }, [session.setIsAuthenticated, session.setWorkspaceRole]);

  return { switchTenant, logout };
}

/* ── sub-hook: side effects ── */

function useAuthEffects(
  session: AuthSessionState,
  form: AuthLoginFormState,
  resetAuthState: () => void,
  refreshSession: () => Promise<boolean>,
) {
  // 页面刷新后恢复会话
  useEffect(() => {
    if (!hadPriorSession()) {
      session.setSessionRestoring(false);
      return;
    }
    let cancelled = false;
    refreshSession()
      .catch(() => { /* refreshSession 内部已处理失败 */ })
      .finally(() => { if (!cancelled) session.setSessionRestoring(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // hash 路由同步
  useEffect(() => {
    const handleHashChange = () => session.setRoute(resolveAppRoute(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [session.setRoute]);

  // 验证码倒计时
  useEffect(() => {
    if (form.countdown <= 0) return;
    const timer = window.setInterval(() => {
      form.setCountdown((prev: number) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [form.countdown, form.setCountdown]);

  // 认证过期事件监听
  useEffect(() => {
    const handleExpired = () => { resetAuthState(); };
    window.addEventListener("buildwise:auth-expired", handleExpired);
    return () => window.removeEventListener("buildwise:auth-expired", handleExpired);
  }, [resetAuthState]);

  // 租户状态可能失效(403): 拉最新 tenants 修正本地缓存的脏 tenantId (v0.18.0 缺陷B治本)
  useEffect(() => {
    const handleStale = () => { refreshSession().catch(() => { /* refreshSession 内部已处理失败 */ }); };
    window.addEventListener("buildwise:tenant-stale", handleStale);
    return () => window.removeEventListener("buildwise:tenant-stale", handleStale);
  }, [refreshSession]);
}

/* ── sub-hook: login handlers ── */

function useRequestCodeHandler(form: AuthLoginFormState) {
  return useCallback(async () => {
    const phone = form.loginPhone.trim();
    if (!/^1\d{10}$/.test(phone)) {
      form.setLoginTouched((prev) => ({ ...prev, phone: true }));
      form.loginPhoneRef.current?.focus();
      return;
    }
    try {
      form.setSendingCode(true);
      form.setLoginError("");
      const result = await requestSmsLoginCode(phone);
      form.setCountdown(60);
      const debugCode = (result.debugCode || "").trim();
      form.setDebugCodeHint(debugCode ? `测试验证码：${debugCode}` : "");
      if (debugCode) form.setLoginCode(debugCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "验证码发送失败";
      const retryAfterSeconds = extractRetryAfterSeconds(message);
      if (retryAfterSeconds > 0) {
        form.setCountdown(retryAfterSeconds);
        form.setLoginError(formatSmsRateLimitMessage(retryAfterSeconds));
      } else {
        form.setLoginError(message);
      }
    } finally {
      form.setSendingCode(false);
    }
  }, [form]);
}

type ApplyTenantFn = (tenants: AuthTenantSummary[], tenantId: string, role?: "owner" | "pm" | "developer" | "qa" | "viewer") => void;

function useLoginHandler(session: AuthSessionState, form: AuthLoginFormState, applyTenantSession: ApplyTenantFn) {
  return useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const modeError = getLoginModeSubmitError(form.loginMode);
    if (modeError) { form.setLoginError(modeError); return; }
    form.setLoginSubmitted(true);
    if (!/^1\d{10}$/.test(form.loginPhone.trim())) { form.loginPhoneRef.current?.focus(); return; }
    if (!/^\d{6}$/.test(form.loginCode.trim())) { form.loginCodeRef.current?.focus(); return; }
    try {
      form.setLoginError("");
      const result = await verifySmsLoginCode(form.loginPhone.trim(), form.loginCode.trim());
      if (result.accessToken && result.expiresIn) saveTokens(result.accessToken, result.expiresIn);
      const role = result.user.workspaceRole;
      localStorage.setItem("buildwise:auth", "logged_in");
      localStorage.setItem("buildwise:auth-phone", result.user.phone);
      localStorage.setItem("buildwise:auth-role", role);
      applyTenantSession(result.tenants, result.currentTenantId, role);
      window.dispatchEvent(new CustomEvent("buildwise:auth-role-updated", { detail: { role } }));
      session.setIsAuthenticated(true);
      form.setLoginCode("");
      form.setLoginTouched({ phone: false, code: false });
      form.setLoginSubmitted(false);
      navigateAfterLogin();
    } catch (error) {
      form.setLoginError(error instanceof Error ? error.message : "登录失败");
    }
  }, [form, session, applyTenantSession]);
}

function navigateAfterLogin(): void {
  const currentHash = window.location.hash;
  const targetRoute = resolveAppRoute(currentHash);
  if (targetRoute !== "workspace") {
    localStorage.setItem("buildwise:active-view", "dashboard");
    window.location.hash = "/dashboard";
  }
}

/* ── validation helpers ── */

function deriveLoginValidation(form: AuthLoginFormState) {
  const phoneError = !form.loginPhone.trim()
    ? "请输入手机号"
    : !/^1\d{10}$/.test(form.loginPhone.trim()) ? "请输入11位手机号" : "";
  const codeError = !form.loginCode.trim()
    ? "请输入验证码"
    : !/^\d{6}$/.test(form.loginCode.trim()) ? "验证码应为6位数字" : "";
  const showPhoneError = (form.loginTouched.phone || form.loginSubmitted) && Boolean(phoneError);
  const showCodeError = (form.loginTouched.code || form.loginSubmitted) && Boolean(codeError);
  return { phoneError, codeError, showPhoneError, showCodeError };
}

/* ── main hook ── */

export function useAuthController() {
  const session = useAuthSessionState();
  const form = useAuthLoginFormState();
  const core = useAuthCoreActions(session);
  const user = useAuthUserActions(session);
  useAuthEffects(session, form, core.resetAuthState, core.refreshSession);
  const handleRequestCode = useRequestCodeHandler(form);
  const handleLogin = useLoginHandler(session, form, core.applyTenantSession);
  const validation = deriveLoginValidation(form);

  return {
    route: session.route,
    isAuthenticated: session.isAuthenticated,
    sessionRestoring: session.sessionRestoring,
    workspaceRole: session.workspaceRole,
    tenants: session.tenants,
    currentTenantId: session.currentTenantId,
    loginPhone: form.loginPhone,
    setLoginPhone: form.setLoginPhone,
    loginCode: form.loginCode,
    setLoginCode: form.setLoginCode,
    loginTouched: form.loginTouched,
    setLoginTouched: form.setLoginTouched,
    showPhoneError: validation.showPhoneError,
    showCodeError: validation.showCodeError,
    phoneError: validation.phoneError,
    codeError: validation.codeError,
    loginError: form.loginError,
    loginMode: form.loginMode,
    setLoginMode: form.setLoginMode,
    debugCodeHint: form.debugCodeHint,
    refreshSession: core.refreshSession,
    sendingCode: form.sendingCode,
    countdown: form.countdown,
    loginPhoneRef: form.loginPhoneRef,
    loginCodeRef: form.loginCodeRef,
    handleRequestCode,
    handleLogin,
    switchTenant: user.switchTenant,
    logout: user.logout,
  };
}
