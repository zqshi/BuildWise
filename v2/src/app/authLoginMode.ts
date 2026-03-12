export type LoginMode = "account" | "sms";

export const ACCOUNT_LOGIN_UNAVAILABLE_MESSAGE = "当前环境仅支持手机验证码登录，请切换到“手机验证码”并先发送验证码。";

export function getDefaultLoginMode(): LoginMode {
  return "sms";
}

export function getLoginModeSubmitError(mode: LoginMode): string {
  return mode === "account" ? ACCOUNT_LOGIN_UNAVAILABLE_MESSAGE : "";
}

export function shouldShowRequestCodeButton(mode: LoginMode): boolean {
  return mode === "sms";
}

export function getLoginModeCopy(mode: LoginMode) {
  if (mode === "sms") {
    return {
      phoneLabel: "手机号",
      phonePlaceholder: "请输入11位手机号",
      codeLabel: "验证码",
      codePlaceholder: "请输入6位验证码",
      submitText: "登 录"
    };
  }
  return {
    phoneLabel: "账号",
    phonePlaceholder: "请输入用户名/邮箱",
    codeLabel: "密码",
    codePlaceholder: "请输入密码",
    submitText: "登 录"
  };
}
