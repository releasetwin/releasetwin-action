// SPDX-FileCopyrightText: 2026 Ernesto Alejo and the ReleaseTwin contributors
// SPDX-License-Identifier: Apache-2.0
//
// ci-pr-integration: renders a ReleaseTwin run summary onto the pull request as a
// marker-keyed comment (upserted in place) and a check run. Node 20 built-ins only —
// no npm install. Uses only GITHUB_TOKEN and GitHub's REST API.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MARKER = "<!-- releasetwin-summary -->";
const API = "https://api.github.com";

// ---- pure rendering (exported for tests) ------------------------------------

export function renderBody(s) {
  if (!s) {
    return `${MARKER}\n## ReleaseTwin\n\n:x: The run produced no summary — check the job log.`;
  }

  const icon = s.overall === "passed" ? ":white_check_mark:" : ":x:";
  const fp = s.flagProof ?? { proven: 0, ineligible: 0, regressed: 0 };
  // pr-annotation-evidence-link: only present when the run uploaded to a hosted project.
  const runLine = s.runUrl ? ` · [View run](${s.runUrl})` : "";
  const lines = [
    MARKER,
    `## ReleaseTwin — ${icon} ${s.overall}${runLine}`,
    "",
    `**${s.totals.passed}** passed · **${s.totals.failed}** failed · ${s.totals.cases} cases`,
    "",
    `Flag proof: **${fp.proven}** proven · ${fp.ineligible} ineligible · **${fp.regressed}** regressed`,
  ];

  const notable = (s.cases ?? []).filter(
    (c) => c.outcome === "failed" || (c.flagProof && c.flagProof !== "Ineligible" && c.flagProof !== "Passed") || c.flagProof === "Passed",
  );
  if (notable.length) {
    lines.push("", "| Case | Outcome | Classification | Flag proof | Release |", "| --- | --- | --- | --- | --- |");
    for (const c of notable) {
      // A failing/notable case that uploaded accepted evidence links to its evidence page.
      const id = c.evidenceUrl ? `[\`${c.id}\`](${c.evidenceUrl})` : `\`${c.id}\``;
      lines.push(`| ${id} | ${c.outcome} | ${c.classification ?? "—"} | ${c.flagProof ?? "—"} | ${c.release ?? "—"} |`);
    }
  }
  return lines.join("\n");
}

export function checkPayload(s, body, sha) {
  const conclusion = s && s.overall === "passed" ? "success" : "failure";
  const check = {
    name: "ReleaseTwin",
    head_sha: sha,
    status: "completed",
    conclusion,
    output: {
      title: s ? `${s.totals.passed} passed, ${s.totals.failed} failed` : "No run summary",
      summary: body.replace(`${MARKER}\n`, ""),
    },
  };
  // pr-annotation-evidence-link: click-through from the check to the hosted run, when there is one.
  if (s?.runUrl) check.details_url = s.runUrl;
  return check;
}

// ---- side-effecting main ---------------------------------------------------

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`::error::${name} is not set`);
    process.exit(1);
  }
  return value;
}

async function gh(token, path, method = "GET", body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "releasetwin-pr-annotations",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

function readSummary(summaryPath) {
  try {
    return JSON.parse(readFileSync(summaryPath, "utf8"));
  } catch (e) {
    console.error(`::error::could not read run summary at ${summaryPath}: ${e.message}`);
    // The CLI produced no summary at all — surface it as a failure.
    return null;
  }
}

function pullNumber() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    return event.pull_request?.number ?? event.number ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const token = required("GITHUB_TOKEN");
  const [owner, repo] = required("GITHUB_REPOSITORY").split("/");
  // The PR head on a pull_request event; the plain commit otherwise. GITHUB_SHA on a
  // pull_request event is the merge commit, which would hide the check run from the PR.
  const sha = process.env.RELEASETWIN_HEAD_SHA || required("GITHUB_SHA");
  const summaryPath = required("RELEASETWIN_SUMMARY");
  const wantComment = (process.env.RELEASETWIN_COMMENT ?? "true") !== "false";
  const wantCheck = (process.env.RELEASETWIN_CHECK ?? "true") !== "false";

  const summary = readSummary(summaryPath);
  const body = renderBody(summary);
  const pr = pullNumber();

  if (wantComment) {
    if (pr) {
      const comments = await gh(token, `/repos/${owner}/${repo}/issues/${pr}/comments?per_page=100`);
      const existing = comments.find((c) => typeof c.body === "string" && c.body.includes(MARKER));
      if (existing) {
        await gh(token, `/repos/${owner}/${repo}/issues/comments/${existing.id}`, "PATCH", { body });
        console.log(`Updated comment ${existing.id}`);
      } else {
        await gh(token, `/repos/${owner}/${repo}/issues/${pr}/comments`, "POST", { body });
        console.log("Created comment");
      }
    } else {
      console.log("::notice::not a pull request — skipping the comment");
    }
  }
  if (wantCheck) {
    const check = checkPayload(summary, body, sha);
    await gh(token, `/repos/${owner}/${repo}/check-runs`, "POST", check);
    console.log(`Created check run (${check.conclusion})`);
  }

  // Mirror the CLI's own verdict as this action's exit code.
  process.exit(summary && summary.overall === "passed" ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
