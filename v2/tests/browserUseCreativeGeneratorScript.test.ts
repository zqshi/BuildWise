import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const v2Dir = resolve(testDir, "..");
const scriptPath = resolve(v2Dir, "scripts", "browser_use_creative_generator_e2e.py");

test("browser-use creative generator e2e keeps browser session alive across stages", () => {
  const source = readFileSync(scriptPath, "utf-8");
  assert.match(source, /HEADLESS = \(os\.getenv\('BROWSER_USE_HEADLESS', '0'\)/);
  assert.match(source, /keep_alive=True/);
  assert.match(source, /BrowserProfile\(\s*headless=HEADLESS,/);
  assert.match(source, /tempfile\.mkdtemp\(prefix='buildwise-browser-use-'\)/);
  assert.match(source, /user_data_dir=fresh_profile_dir/);
  assert.match(source, /BROWSER_USE_PROVIDER = os\.getenv\('BROWSER_USE_PROVIDER', 'anthropic'\)/);
  assert.match(source, /ChatOpenAI/);
  assert.match(source, /ChatDeepSeek/);
  assert.match(source, /BROWSER_USE_PROVIDER in \{'openai-compatible', 'deepseek'\}/);
  assert.match(source, /prefer_minimax = BROWSER_USE_PROVIDER == 'minimax'/);
  assert.match(source, /os\.getenv\('MINIMAX_API_KEY'\)/);
  assert.match(source, /os\.getenv\('MINIMAX_API_BASE'\)/);
  assert.match(source, /os\.getenv\('MINIMAX_MODEL'\)/);
  assert.match(source, /def build_fallback_llm\(\)/);
  assert.match(source, /fallback_llm=fallback_llm/);
  assert.match(source, /os\.getenv\('DEEPSEEK_API_KEY'\)/);
  assert.match(source, /deepseek-chat/);
  assert.match(source, /use_vision=False, suffix='dom-fallback'/);
  assert.match(source, /use_vision=True, suffix='vision'/);
  assert.match(source, /if not ok and fallback_llm is not None:/);
  assert.match(source, /payload\.get\('iterations'\)/);
  assert.match(source, /v11_analysis_drawer/);
  assert.match(source, /drawer_to_chat/);
  assert.match(source, /switch_to_v1/);
  assert.match(source, /chat_followup_v1/);
  assert.match(source, /len\(results\) == 14/);
});
