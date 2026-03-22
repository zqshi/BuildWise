import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stylesPath = new URL("../src/styles/marketing.css", import.meta.url);

test("marketing hero adopts centered premium dark treatment", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(
    styles,
    /\.marketing-hero\s*\{[\s\S]*?display:\s*grid;[\s\S]*?place-items:\s*center;[\s\S]*?text-align:\s*center/,
    "marketing page should keep a centered hero structure like a marketing site"
  );
  assert.match(
    styles,
    /\.marketing-hero-stage-board\s*\{[\s\S]*?border-radius:\s*36px;[\s\S]*?backdrop-filter:\s*blur\(22px\)/,
    "hero visual should use a premium stage treatment instead of a plain placeholder block"
  );
});

test("marketing page keeps problem-solution contrast section", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(styles, /\.marketing-contrast\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.marketing-solution-column::before\s*\{[\s\S]*?radial-gradient\(circle,\s*rgba\(0,\s*102,\s*255,\s*0\.12\)/);
  assert.match(styles, /\.marketing-problem-column\s*\{[\s\S]*?opacity:\s*0\.78;/);
  assert.match(styles, /\.marketing-solution-column h2\s*\{[\s\S]*?text-shadow:\s*0 10px 34px rgba\(11,\s*99,\s*243,\s*0\.08\)/);
  assert.match(styles, /\.marketing-problem-column li::before\s*\{[\s\S]*?rgba\(201,\s*212,\s*227,\s*0\.74\)/);
  assert.match(styles, /\.marketing-solution-column li::before\s*\{[\s\S]*?rgba\(11,\s*99,\s*243,\s*0\.34\)/);
});

test("marketing page keeps premium feature and journey layouts", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(styles, /\.marketing-feature-grid\s*\{[\s\S]*?repeat\(auto-fit,\s*minmax\(220px,\s*1fr\)\)/);
  assert.match(styles, /\.marketing-feature-icon\s*\{[\s\S]*?linear-gradient\(135deg,\s*var\(--brand-500\),\s*#2f7cff\)/);
  assert.match(styles, /\.marketing-journey-row\s*\{[\s\S]*?grid-template-columns:\s*220px 1fr/);
  assert.match(styles, /\.marketing-journey-row \+ \.marketing-journey-row\s*\{[\s\S]*?border-top:\s*1px solid/);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.marketing-journey-row:hover/);
  assert.match(styles, /\.marketing-journey-visual::before\s*\{[\s\S]*?opacity:\s*0;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none/);
  assert.match(styles, /\.marketing-journey-detail-list\s*\{/);
  assert.match(styles, /\.marketing-section\s*\{[\s\S]*?gap:\s*42px;/);
});

test("marketing page uses login-aligned backdrop treatment", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(
    styles,
    /\.marketing-backdrop\s*\{[\s\S]*?linear-gradient\(180deg,\s*#f4f7fb 0%,\s*#edf3fb 36%,\s*#ffffff 100%\)/,
    "marketing backdrop should keep the login page white-blue palette"
  );
  assert.match(
    styles,
    /\.marketing-nav\s*\{[\s\S]*?background:\s*transparent;/,
    "top navigation should not introduce a visible background slab behind the logo"
  );
  assert.match(
    styles,
    /\.marketing-cta\s*\{[\s\S]*?padding:\s*52px 0 0;[\s\S]*?border-top:\s*0;/,
    "cta should rely on whitespace instead of a divider line"
  );
  assert.match(
    styles,
    /\.marketing-footer\s*\{[\s\S]*?border-top:\s*1px solid/,
    "footer should add a light official closing band"
  );
});

test("marketing layout collapses key sections on narrower screens", () => {
  const styles = readFileSync(stylesPath, "utf8");

  assert.match(
    styles,
    /@media \(max-width: 980px\)[\s\S]*?\.marketing-contrast,[\s\S]*?\.marketing-journey-row,[\s\S]*?\.marketing-cta,[\s\S]*?\.marketing-footer\s*\{[\s\S]*?1fr/,
    "marketing layout should stack key content areas on smaller screens"
  );
});
