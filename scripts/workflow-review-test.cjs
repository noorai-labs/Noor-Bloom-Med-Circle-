const assert = require("node:assert/strict");
const fs = require("node:fs");
const workflow = fs.readFileSync(
  ".github/workflows/dev-expo-build.yml",
  "utf8",
);
const block = workflow
  .split("          script: |\n")[1]
  ?.split("  validate:")[0];
assert.ok(block, "approval guard exists");
const source = block
  .split(/\r?\n/)
  .map((line) => line.replace(/^            /, ""))
  .join("\n");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction("github", "context", "core", source);
const pr = {
  number: 1,
  base: { ref: "dev" },
  merged_at: "2026-11-13",
  merge_commit_sha: "merge",
  head: { sha: "head" },
  user: { login: "author" },
};
const review = (
  login,
  state = "APPROVED",
  commit_id = "head",
  type = "User",
) => ({ user: { login, type }, state, commit_id });
async function run({
  pulls = [pr],
  reviews = [review("reviewer")],
  permissions = {},
} = {}) {
  const github = {
    rest: {
      repos: {
        listPullRequestsAssociatedWithCommit: "pulls",
        getCollaboratorPermissionLevel: async ({ username }) => ({
          data: { permission: permissions[username] || "write" },
        }),
      },
      pulls: { get: async () => ({ data: pr }), listReviews: "reviews" },
    },
    paginate: async (endpoint) => (endpoint === "pulls" ? pulls : reviews),
  };
  const summary = {
    addHeading() {
      return this;
    },
    addRaw() {
      return this;
    },
    write() {
      return this;
    },
  };
  return execute(
    github,
    { repo: { owner: "test", repo: "test" }, sha: "merge" },
    { summary },
  );
}
(async () => {
  await run();
  await assert.rejects(run({ pulls: [] }), /merged into dev/);
  await assert.rejects(run({ reviews: [review("author")] }), /At least one/);
  await assert.rejects(
    run({ reviews: [review("reviewer", "APPROVED", "old")] }),
    /At least one/,
  );
  await assert.rejects(
    run({ reviews: [review("bot", "APPROVED", "head", "Bot")] }),
    /At least one/,
  );
  await assert.rejects(
    run({ permissions: { reviewer: "read" } }),
    /At least one/,
  );
  await assert.rejects(
    run({ reviews: [review("reviewer"), review("reviewer", "DISMISSED")] }),
    /At least one/,
  );
  await assert.rejects(
    run({
      reviews: [review("reviewer"), review("other", "CHANGES_REQUESTED")],
    }),
    /requests changes/,
  );
  await run({
    reviews: [review("reviewer", "CHANGES_REQUESTED"), review("reviewer")],
  });
  await run({ reviews: [review("reviewer"), review("reviewer", "COMMENTED")] });
  console.log(
    "Passed: merged-PR guard, independent/current approvals, permissions, dismissals and changes-requested blocking.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
