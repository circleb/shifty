// Workers Builds calls `npx wrangler deploy`. Wrangler 4.156.0 validates the
// Worker name with one API request and treats a rate limit (error 971) as fatal.
// That request is the one that failed the 15:02 build. Retry it after Retry-After.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const target = join(dirname(fileURLToPath(import.meta.url)), "../node_modules/wrangler/wrangler-dist/cli.js");
const source = readFileSync(target, "utf8");

const marker = "async function fetchWorkerServiceForNameCheck(";
if (source.includes(marker)) {
  process.exit(0);
}

const needle = `    const worker = await fetchResult(
      complianceConfig,
      \`/accounts/\${accountId}/workers/services/\${workerName}\`
    );
    tag = worker.default_environment.script.tag;`;

const helper = `async function fetchWorkerServiceForNameCheck(complianceConfig, accountId, workerName) {
  const resource = \`/accounts/\${accountId}/workers/services/\${workerName}\`;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchResult(complianceConfig, resource);
    } catch (err) {
      const waitMs = err?.retryAfterMs;
      const rateLimited = err?.code === 971 || err?.status === 429;
      if (!rateLimited || attempt >= 5 || typeof waitMs !== "number" || waitMs > 120000) throw err;
      logger.log(\`Cloudflare rate limited the Worker name check. Waiting \${Math.ceil(waitMs / 1000)}s, then retrying...\`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
`;

const replacement = `    const worker = await fetchWorkerServiceForNameCheck(complianceConfig, accountId, workerName);
    tag = worker.default_environment.script.tag;`;

if (!source.includes(needle)) {
  console.error("Wrangler name-check patch could not find its target. The installed wrangler build does not match 4.156.0.");
  process.exit(1);
}

const anchor = "async function verifyWorkerMatchesCITag(";
const anchorAt = source.indexOf(anchor);
if (anchorAt < 0) {
  console.error("Wrangler name-check patch could not find verifyWorkerMatchesCITag().");
  process.exit(1);
}

const next = source.slice(0, anchorAt) + helper + source.slice(anchorAt).replace(needle, replacement);
if (!next.includes(marker) || !next.includes("fetchWorkerServiceForNameCheck(complianceConfig, accountId, workerName)")) {
  console.error("Wrangler name-check patch did not apply cleanly.");
  process.exit(1);
}

writeFileSync(target, next);
console.log("Patched Wrangler to retry the Worker name check when Cloudflare rate limits it.");
