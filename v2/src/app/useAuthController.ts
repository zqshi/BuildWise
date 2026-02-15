import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

function getHashRoute() {
  return window.location.hash === "#/login" ? "login" : "workspace";
}

export function useAuthController() {
  const [route, setRoute] = useState<"workspace" | "login">(getHashRoute);
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem("buildwise:auth") !== "logged_out"
  );
  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginTouched, setLoginTouched] = useState<{ account: boolean; password: boolean }>({
    account: false,
    password: false
  });
  const [loginSubmitted, setLoginSubmitted] = useState(false);
  const loginAccountRef = useRef<HTMLInputElement | null>(null);
  const loginPasswordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleHashChange = () => setRoute(getHashRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!isAuthenticated && route !== "login") {
      window.location.hash = "/login";
    }
  }, [isAuthenticated, route]);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginSubmitted(true);
    if (!loginAccount.trim()) {
      loginAccountRef.current?.focus();
      return;
    }
    if (!loginPassword.trim()) {
      loginPasswordRef.current?.focus();
      return;
    }
    localStorage.setItem("buildwise:auth", "logged_in");
    setIsAuthenticated(true);
    setLoginPassword("");
    setLoginTouched({ account: false, password: false });
    setLoginSubmitted(false);
    window.location.hash = "/dashboard";
  };

  const logout = () => {
    const confirmed = window.confirm("确认退出登录吗？");
    if (!confirmed) {
      return false;
    }
    localStorage.setItem("buildwise:auth", "logged_out");
    localStorage.removeItem("buildwise:userAvatar");
    setIsAuthenticated(false);
    window.location.hash = "/login";
    return true;
  };

  const accountError = !loginAccount.trim() ? "请输入账号" : "";
  const passwordError = !loginPassword.trim() ? "请输入密码" : "";
  const showAccountError = (loginTouched.account || loginSubmitted) && Boolean(accountError);
  const showPasswordError = (loginTouched.password || loginSubmitted) && Boolean(passwordError);

  return {
    route,
    isAuthenticated,
    loginAccount,
    setLoginAccount,
    loginPassword,
    setLoginPassword,
    loginTouched,
    setLoginTouched,
    showAccountError,
    showPasswordError,
    accountError,
    passwordError,
    loginAccountRef,
    loginPasswordRef,
    handleLogin,
    logout
  };
}
