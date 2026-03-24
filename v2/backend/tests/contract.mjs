import { createContractHarness } from "./contractHarness.mjs";
import { runContractGovernanceScenario } from "./contractGovernanceScenario.mjs";
import { runContractLifecycleScenario } from "./contractLifecycleScenario.mjs";

let harness = null;
const state = {};

try {
  harness = await createContractHarness();
  await runContractGovernanceScenario(harness, state);
  await runContractLifecycleScenario(harness, state);
  console.log("Contract test passed.");
} catch (error) {
  if (harness) {
    harness.logFailure(error);
  } else {
    console.error("Contract test failed:", error);
  }
  process.exitCode = 1;
} finally {
  harness?.cleanup();
}
