// The repository is public from 2026-11-18 (docs/plans/active/public-repo-private-data-plan.md): CI checks and builds,
// and never publishes an image, an artifact or the TheOracle index anywhere.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const [check, docker] = [workflow.split("\n  check:\n")[1].split("\n  docker:\n")[0], workflow.split("\n  docker:\n")[1]];

test("the docker job builds the image without pushing, logging in or uploading", () => {
  assert.ok(docker, "a docker job exists");
  assert.match(docker, /uses: docker\/build-push-action@v\d+/);
  assert.match(docker, /^ {10}push: false$/m);
  for (const forbidden of [/docker login/, /ghcr\.io/, /upload-artifact/, /packages: write/, /packages\/container/, /outputs:/]) assert.doesNotMatch(docker, forbidden);
  assert.match(docker, /permissions:\n {6}contents: read\n {4}steps:/);
});

test("no job reads secrets or fetches the private TheOracle index", () => {
  assert.doesNotMatch(workflow, /secrets\./);
  for (const retired of [/install-theoracle-index/, /publish-theoracle-index/, /theoracle\/index\/vectors\.f32/, /SENTRAPEDIA_INDEX_TOKEN/]) assert.doesNotMatch(workflow, retired);
});

test("the image is built from the same immutable pull request revision the checks ran on", () => {
  const ref = job => job.split(/\n {6}- /).find(step => step.startsWith("uses: actions/checkout@")).match(/ref: (.+)/)[1];
  assert.equal(ref(docker), ref(check));
  assert.match(ref(check), /github\.event\.pull_request\.head\.sha/);
  assert.match(docker, /needs: check/);
});
