import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stylesPath = new URL("../src/styles/base.css", import.meta.url);

test("login layout removes brand panel on narrow screens to keep first screen visible", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(styles, /@media \(max-width:980px\)[\s\S]*?\.auth-brand-panel\s*\{\s*display:none/, "mobile width must hide brand panel");
  assert.match(
    styles,
    /@media \(max-width:980px\)[\s\S]*?\.auth-card\s*\{[\s\S]*?max-width:min\(560px,100%\)[\s\S]*?margin:0 auto/,
    "mobile width must center and constrain login card",
  );
});

test("login card uses adaptive padding instead of fixed top offset", () => {
  const styles = readFileSync(stylesPath, "utf8");
  const authCardRule = styles.match(/\.auth-card\s*\{[\s\S]*?\}/);

  assert.ok(authCardRule, "missing .auth-card rule");
  assert.match(authCardRule[0], /padding:clamp\(36px,18vh,230px\)/, "auth card must adapt top spacing to viewport height");
  assert.match(authCardRule[0], /max-width:none/, "desktop login card should keep the original full-column width");
});
