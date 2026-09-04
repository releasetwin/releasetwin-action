// SPDX-FileCopyrightText: 2026 Ernesto Alejo and the ReleaseTwin contributors
// SPDX-License-Identifier: Apache-2.0
//
// ci-pr-integration + pr-annotation-evidence-link: the comment body and check payload.
// Run with `node --test integrations/github-action/`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderBody, checkPayload, MARKER } from "./render.mjs";

const v1 = {
  schemaVersion: 1,
  overall: "failed",
  totals: { passed: 1, failed: 1, cases: 2 },
  flagProof: { proven: 1, ineligible: 0, regressed: 0 },
  cases: [
    { id: "OK-1", outcome: "passed", classification: null, flagProof: "Passed", release: null },
    { id: "BAD-1", outcome: "failed", classification: "assertion", flagProof: null, release: "4.2" },
  ],
};

test("a summary with no URLs renders exactly as before", () => {
  const body = renderBody(v1);
  assert.ok(body.startsWith(`${MARKER}\n## ReleaseTwin — :x: failed\n`));
  assert.ok(!body.includes("View run"));
  assert.ok(body.includes("| `BAD-1` | failed |"));
  assert.ok(body.includes("| `OK-1` | passed |"));
});

test("a v1 summary (old CLI, new Action) still renders", () => {
  const body = renderBody({ ...v1, schemaVersion: 1 });
  assert.ok(body.includes("## ReleaseTwin"));
});

test("runUrl adds a header link and sets the check details_url", () => {
  const s = { ...v1, schemaVersion: 2, runUrl: "https://app.example.com/dashboard?projectId=p" };
  const body = renderBody(s);
  assert.ok(body.includes("[View run](https://app.example.com/dashboard?projectId=p)"));

  const check = checkPayload(s, body, "abc123");
  assert.equal(check.details_url, "https://app.example.com/dashboard?projectId=p");
  assert.equal(check.conclusion, "failure");
});

test("a case with evidenceUrl links its row", () => {
  const s = {
    ...v1,
    schemaVersion: 2,
    cases: [{ id: "BAD-1", outcome: "failed", classification: "assertion", flagProof: null, release: null, evidenceUrl: "https://app.example.com/dashboard/reports/r/evidence?projectId=p" }],
  };
  const body = renderBody(s);
  assert.ok(body.includes("| [`BAD-1`](https://app.example.com/dashboard/reports/r/evidence?projectId=p) | failed |"));
});

test("no details_url when the summary has no runUrl", () => {
  const check = checkPayload(v1, renderBody(v1), "abc123");
  assert.ok(!("details_url" in check));
});

test("a missing summary renders the no-summary body and a failure check", () => {
  const body = renderBody(null);
  assert.ok(body.includes("produced no summary"));
  const check = checkPayload(null, body, "abc123");
  assert.equal(check.conclusion, "failure");
  assert.equal(check.output.title, "No run summary");
});

test("attribution is on by default and links the product site", () => {
  const body = renderBody(v1);
  assert.ok(body.includes("[ReleaseTwin](https://releasetwin.com)"));
});

test("attribution: false omits the product-site link, body otherwise unchanged", () => {
  const withAttribution = renderBody(v1, { attribution: true });
  const withoutAttribution = renderBody(v1, { attribution: false });
  assert.ok(!withoutAttribution.includes("releasetwin.com"));
  assert.ok(withAttribution.startsWith(withoutAttribution));
});

test("the check payload carries no attribution content regardless of the option", () => {
  const attributedBody = renderBody(v1, { attribution: true });
  const checkBody = renderBody(v1, { attribution: false });
  const check = checkPayload(v1, checkBody, "abc123");
  assert.ok(!check.output.summary.includes("releasetwin.com"));
  assert.notEqual(checkBody, attributedBody);
});
