// Scans every commit's diff for secrets before the repository is made public.
//   node scripts/audit-history.mjs
// Prints "<commit> <kind>" per hit (never the secret itself) and exits 1 if anything is found.
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const PATTERNS = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["npm token", /\bnpm_[A-Za-z0-9]{36}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
];

export function findSecrets(text) {
  return PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const git = spawn("git", ["log", "--all", "-p", "--format=commit %H"], { cwd: root });
  let commit = "", hits = 0, gitStderr = "";
  const closed = new Promise((resolve) => {
    git.on("close", resolve);
    git.on("error", () => resolve(1));
  });
  git.stderr.on("data", (chunk) => { gitStderr += chunk.toString(); });
  for await (const line of readline.createInterface({ input: git.stdout })) {
    if (line.startsWith("commit ")) { commit = line.slice(7, 19); continue; }
    if (!line.startsWith("+")) continue;
    for (const kind of findSecrets(line)) { console.log(`${commit} ${kind}`); hits++; }
  }
  const code = await closed;
  if (code !== 0) {
    console.error(`git log failed (exit ${code}); the history was not scanned`);
    if (gitStderr) console.error(gitStderr);
    process.exit(2);
  }
  console.log(hits ? `${hits} possible secret(s) in history` : "No secrets found in history");
  process.exit(hits ? 1 : 0);
}
