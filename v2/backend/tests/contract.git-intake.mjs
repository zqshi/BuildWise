import { runContractGitIntakeScenario } from "./contractGitIntakeScenario.mjs";

try {
  await runContractGitIntakeScenario();
  console.log("contract.git-intake.mjs passed");
} catch (error) {
  console.error("contract.git-intake.mjs failed:", error);
  process.exitCode = 1;
}
