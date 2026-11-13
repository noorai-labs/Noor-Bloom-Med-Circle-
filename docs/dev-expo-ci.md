# Reviewed dev merges and Expo Android builds

Repository: https://github.com/noorai-labs/Noor-Bloom-Med-Circle-

## Active branch rule

`dev` is protected in GitHub settings: one approving review, stale approvals dismissed, latest push approved by someone else, conversations resolved, administrators included, no force pushes and no branch deletion. Direct pushes are blocked. PR authors cannot approve their own PR. The organization repository is public so these protections work on GitHub Free.

The server setting is independent of workflow files. Once the first `PR checks` run exists, configure `Validate` as a required status check with the branch required to be up to date. The prepared `.github/dev-branch-protection.json` contains that full setting for repeatable administration. Applying it requires repository administration permission.

## Workflow behavior

- Open or update a PR targeting `dev`: lint, app/backend type checks, workflow tests, clinic/auth/reminder tests and isolated cloud integration tests run without Expo secrets.
- After the reviewed PR is merged into `dev`: the build workflow confirms the pushed commit belongs to a merged PR and checks an independent write/admin review of the latest PR head. Direct pushes, stale approvals, bot/self approvals and unresolved change requests do not queue Expo builds.
- The merged code is validated again. Only then does EAS queue an Android internal-distribution APK using the existing `preview` profile and its remote signing credentials/Firebase file configuration. A link is written in the Actions job summary.
- The workflow queues the build; Actions submission success does not mean native Gradle compilation succeeded. Open the Expo build link for its final result.
- This does not deploy Cloudflare or submit to Google Play. Bump app version/versionCode in release PRs as needed.

## One-time Expo secret

1. Sign in to the Expo account with access to `@dominateranc/bloom-med`.
2. Open https://expo.dev/accounts/dominateranc/settings/access-tokens and create an access token for CI. Keep it out of chat/source code.
3. Open https://github.com/noorai-labs/Noor-Bloom-Med-Circle-/settings/secrets/actions and choose New repository secret.
4. Name: `EXPO_TOKEN`. Value: the Expo token. Save it.
5. Keep `GOOGLE_SERVICES_JSON` in the existing EAS `preview` environment as a secret file variable. Do not commit it or service-account keys to GitHub.

## Activate

Have a second account with write/admin access review and approve the setup PR, then merge it into `dev`. The PR author cannot satisfy their own approval requirement. No branch-protection bypass is needed or used. The first approved merge queues the APK when EXPO_TOKEN is present. If the token was missing, add it and rerun that workflow.

Official references: https://docs.expo.dev/build/building-on-ci/ and https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## Free code review and security tools

CodeRabbit: install https://github.com/apps/coderabbitai for noorai-labs, only Noor-Bloom-Med-Circle-. Public-repository reviews qualify for the free open-source plan. `.coderabbit.yaml` enables incremental review of dev/qa PRs and reports review errors as failures. CodeRabbit completion is not a substitute for independent human approval and can finish successfully when skipped/rate-limited.

GitGuardian: use its free Starter workspace and connect GitHub from workspace Integrations (https://github.com/apps/gitguardian). Select only this repository. App installation must be authorized by an organization owner; no repository file can install the app. Its real check name/app identity must be observed on a PR before making that check required. Do not configure a nonexistent check that permanently blocks every PR.

The repository's GitHub-native secret scanning, push protection and Dependabot security updates can be enabled free on this public repository. Weekly dependency update configuration targets dev. No paid plan or trial is required for this setup. Never commit Expo, Clerk secret, R2, SSH or Firebase service-account keys.
