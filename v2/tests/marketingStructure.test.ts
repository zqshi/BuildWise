import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pagePath = new URL("../src/pages/marketing/MarketingHomePage.tsx", import.meta.url);

test("marketing nav keeps a single entry action and hero keeps proof structure", () => {
  const source = readFileSync(pagePath, "utf8");
  const navBlock = source.match(/<header className=[\s\S]*?<\/header>/)?.[0] ?? "";

  assert.match(
    navBlock,
    /<div className="marketing-nav-actions">[\s\S]*?<button type="button" className="btn primary" onClick=\{onSecondaryAction\}>/,
    "navigation should keep a single login entry action"
  );
  assert.match(navBlock, /"登录"/, "navigation should label the entry action as login");
  assert.doesNotMatch(source, /查看产品入口|进入产品入口/, "marketing page should not render a product entry CTA");
  assert.match(source, /className="marketing-hero-signal"/, "hero should include a compact signal row");
  assert.match(source, /className="marketing-hero-bottom"/, "hero should keep actions and stats grouped below the visual stage");
  assert.match(source, /className="marketing-footer"/, "marketing page should include a compact footer");
  assert.match(source, /AI-Native Delivery/, "footer should reinforce the product identity");
  assert.doesNotMatch(source, /marketing-footer-link/, "footer should not render a secondary login entry");
});
