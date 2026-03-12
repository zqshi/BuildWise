import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_LOGIN_UNAVAILABLE_MESSAGE,
  getDefaultLoginMode,
  getLoginModeCopy,
  getLoginModeSubmitError,
  shouldShowRequestCodeButton
} from "../src/app/authLoginMode.ts";

test("default login mode is sms", () => {
  assert.equal(getDefaultLoginMode(), "sms");
});

test("sms mode has no submit guard error", () => {
  assert.equal(getLoginModeSubmitError("sms"), "");
});

test("account mode returns explicit unsupported message", () => {
  assert.equal(getLoginModeSubmitError("account"), ACCOUNT_LOGIN_UNAVAILABLE_MESSAGE);
});

test("sms mode copy uses mobile verification labels", () => {
  const copy = getLoginModeCopy("sms");
  assert.equal(copy.phoneLabel, "手机号");
  assert.equal(copy.codeLabel, "验证码");
  assert.match(copy.codePlaceholder, /验证码/);
});

test("account mode copy keeps account/password labels", () => {
  const copy = getLoginModeCopy("account");
  assert.equal(copy.phoneLabel, "账号");
  assert.equal(copy.codeLabel, "密码");
  assert.match(copy.codePlaceholder, /密码/);
});

test("request code button visibility follows sms mode only", () => {
  assert.equal(shouldShowRequestCodeButton("sms"), true);
  assert.equal(shouldShowRequestCodeButton("account"), false);
});
