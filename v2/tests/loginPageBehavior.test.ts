import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginPagePath = new URL("../src/pages/auth/LoginPage.tsx", import.meta.url);
const loginSectionsPath = new URL("../src/pages/auth/loginPageSections.tsx", import.meta.url);

test("account mode keeps forgot password behind explicit unavailable toast", () => {
  const source = readFileSync(loginPagePath, "utf8");

  assert.match(source, /const showUnavailableToast = \(\) => \{\s*setActionToast\("暂未开放"\);/);
  assert.match(source, /{isSmsMode \? null : \(\s*<button type="button" className="auth-link-btn" onClick={showUnavailableToast}>/);
});

test("sms mode remains default and account-only actions stay out of sms tools row", () => {
  const authModeSource = readFileSync(new URL("../src/app/authLoginMode.ts", import.meta.url), "utf8");
  const pageSource = readFileSync(loginPagePath, "utf8");

  assert.match(authModeSource, /return "sms";/, "login page should default to sms mode");
  assert.match(pageSource, /const isSmsMode = loginMode === "sms";/);
});

test("register entry routes to the same unavailable toast action", () => {
  const sectionsSource = readFileSync(loginSectionsPath, "utf8");
  const pageSource = readFileSync(loginPagePath, "utf8");

  assert.match(sectionsSource, /type LoginSocialSectionProps = \{\s*onRegisterClick: \(\) => void;/);
  assert.match(sectionsSource, /<button type="button" className="auth-link-btn" onClick={onRegisterClick}>/);
  assert.match(pageSource, /<LoginSocialSection onRegisterClick={showUnavailableToast} \/>/);
});
