import { runBackupRestoreDrill } from "./releaseVerificationSupport.mjs";

try {
  const report = runBackupRestoreDrill(process.env);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(`[backup-drill] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
