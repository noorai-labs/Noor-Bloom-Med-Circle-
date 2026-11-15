# Reviewed dev merges and Expo Android builds

Repository: https://github.com/noorai-labs/Noor-Bloom-Med-Circle-

## Active branch rule

`dev` is protected in GitHub settings: one approving review, stale approvals dismissed, latest push approved by someone else, conversations resolved, administrators included, no force pushes and no branch deletion. Direct pushes are blocked. PR authors cannot approve their own PR. The organization repository is public so these protections work on GitHub Free.

The server setting is independent of workflow files. Required status checks are active: Validate (GitHub Actions app 15368), CodeRabbit (app 347564), and GitGuardian Security Checks (app 46505), with the branch required to be up to date. Checks are bound to their actual GitHub App identities. `.github/dev-branch-protection.json` records the active setting for repeatable administration. Applying it requires repository administration permission.

## Workflow behavior

- Open or update a PR targeting `dev`: lint, app/backend type checks, workflow tests, clinic/auth/reminder tests and isolated cloud integration tests run without Expo secrets.
- After the reviewed PR is merged into `dev`: the build workflow confirms the pushed commit belongs to a merged PR and checks an independent write/admin review of the latest PR head. Direct pushes, stale approvals, bot/self approvals and unresolved change requests do not queue Expo builds.
- The merged code is validated again. Only then does EAS queue an Android internal-distribution APK using the existing `preview` profile and its remote signing credentials/Firebase file configuration. A link is written in the Actions job summary.
- The workflow queues the build; Actions submission success does not mean native Gradle compilation succeeded. Open the Expo build link for its final result.
- This does not deploy Cloudflare or submit to Google Play. Bump app version/versionCode in release PRs as needed.

## One-time Expo secret

1. Sign in to the Expo account with access to `@devnoorlabss-team/bloom-med`. For CI, create a robot user with Developer access and use its token rather than an unrestricted personal token.
2. Open https://expo.dev/accounts/devnoorlabss-team/settings/access-tokens and create an access token for CI. Keep it out of chat/source code.
3. Open https://github.com/noorai-labs/Noor-Bloom-Med-Circle-/settings/secrets/actions and choose New repository secret.
4. Name: `EXPO_TOKEN`. Value: the Expo token. Save it.
5. Keep `GOOGLE_SERVICES_JSON` in the existing EAS `preview` environment as a secret file variable. Do not commit it or service-account keys to GitHub.

## Activate

Have a second account with write/admin access review and approve the setup PR, then merge it into `dev`. The PR author cannot satisfy their own approval requirement. No branch-protection bypass is needed or used. The first approved merge queues the APK when EXPO_TOKEN is present. If the token was missing, add it and rerun that workflow.

Official references: https://docs.expo.dev/build/building-on-ci/ and https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches

## Free code review and security tools

CodeRabbit is installed and has emitted its CodeRabbit check on this repository. Installation: https://github.com/apps/coderabbitai for noorai-labs, only Noor-Bloom-Med-Circle-. Public-repository reviews qualify for the free open-source plan. `.coderabbit.yaml` enables incremental review of dev/qa PRs and reports review errors as failures. CodeRabbit completion is not a substitute for independent human approval and can finish successfully when skipped/rate-limited.

GitGuardian is installed and its GitGuardian Security Checks check passed on the setup PR. Use its free Starter workspace and connect GitHub from workspace Integrations (https://github.com/apps/gitguardian). Select only this repository. App installation must be authorized by an organization owner; no repository file can install the app. Its actual check name and app identity have been observed and made required. Do not configure nonexistent checks that permanently block every PR.

The repository's GitHub-native secret scanning, push protection and Dependabot security updates are enabled on this public repository. Weekly dependency update PRs target dev, but GitHub reads dependabot.yml from the default branch main. Promote this configuration to main through a reviewed follow-up PR before expecting weekly scheduled updates. Merging this setup into dev alone does not activate that schedule; the separately enabled Dependabot security-update setting is already active. No paid plan or trial is required for this setup. Never commit Expo, Clerk secret, R2, SSH or Firebase service-account keys.


## Sole approver

The intended sole approver is ANC-DOMINATER. `.github/CODEOWNERS` assigns every path to that account, and the server's require-code-owner-reviews flag is enabled. The CODEOWNERS file must merge into base branch dev before GitHub can enforce that identity on subsequent PRs. The Expo guard also requires this exact human account's approval of the latest head; another human or app cannot substitute for it.

GitHub prevents self-approval and approval of your own latest push. Use noorlabs-dev as the contribution account for coding, pushes and PR authorship, and ANC-DOMINATER as the independent approval account. The replacement setup PR is authored and pushed by noorlabs-dev so ANC-DOMINATER can review it. Do not disable protection or reduce approvals as a workaround.

## CodeQL, Dependency Review and Socket

CodeQL default setup is enabled for JavaScript/TypeScript with the extended query suite. Its initial GitHub setup analysis completed successfully (run 43470248323). Successful analysis means the scan ran, not that the repository has no security findings. GitHub rejected Actions-language selection because the workflow files have not reached the repository's base branches yet; add workflow analysis after the setup PR is merged and GitHub detects that language. Do not also add an advanced CodeQL workflow while default setup is enabled.

Dependency Review passed on the contributor setup PR and is required in dev protection (GitHub Actions app 15368). `.github/workflows/dependency-review.yml` scans PRs targeting dev for newly introduced dependencies with known vulnerabilities. It fails for low-severity or higher findings, is not warn-only, and uses read-only repository permissions. It does not automatically approve, merge, change package versions, or prove that unchanged dependencies have no vulnerabilities. ANC-DOMINATER retains human approval.

Socket is installed in noorai-labs with selected-repository access. To manage its installation, sign in as the GitHub organization owner ANC-DOMINATER, open https://github.com/apps/socket-security/installations/new, choose noorai-labs, select only Noor-Bloom-Med-Circle-, review permissions, and install on the Free plan. The contribution account noorlabs-dev cannot authorize an organization-wide App installation. Socket's actual installation and PR checks must be verified before declaring it active or adding a required check name.


## Expo project transfer

The existing bloom-med project now belongs to `devnoorlabss-team`. The existing EAS project ID is retained in the EXPO_PROJECT_ID Actions secret. Set the EXPO_OWNER Actions repository variable and EXPO_PROJECT_ID Actions secret as described below. Do not initialize a replacement project.

The owner must replace GitHub's `EXPO_TOKEN` with a token that can access the destination team, preferably a Developer robot user belonging to that team. Keep the value out of chat and Git. An old team-specific robot token does not automatically gain access to the new team. Personal tokens depend on current membership and scope.

Check the destination preview environment for `GOOGLE_SERVICES_JSON`, other required secret variables, and Android signing/FCM credentials. Account-level variables may need copying. Do not revoke the previous token until the new integration has passed verification. A successful queued build is not a finished APK.


## Expo identity mapping

Repository Actions settings are the CI source of truth:

| Setting | Purpose |
| --- | --- |
| `EXPO_TOKEN` (secret) | Authenticate EAS with access to the owning team |
| `EXPO_OWNER` (repository variable) | Expo account or organization slug |
| `EXPO_PROJECT_ID` (secret) | UUID of the existing linked EAS project |

`app.config.ts` maps owner and project ID from these environment variables; neither is hardcoded in app.json. The workflow validates them, then injects them into the preview profile's environment in the runner's copy of eas.json. That copy travels to the EAS builder so remote config resolves the same identity. This generated change is never committed. The token is never written into eas.json.

The Actions summary derives the dashboard URL from EXPO_OWNER, the app slug and the returned build ID. No separate URL secret is needed. After a transfer, update EXPO_OWNER; retain EXPO_PROJECT_ID when transferring the existing project. Local developers must explicitly export both identity variables into the shell before EAS commands. Do not rely on EAS CLI loading .env.local during app-config resolution. PR validation needs no Expo secrets and does not queue builds.

Configure EXPO_OWNER under Settings > Secrets and variables > Actions > Variables > New repository variable. Remove the obsolete EXPO_OWNER secret after creating the variable. Keep EXPO_TOKEN and EXPO_PROJECT_ID under Secrets.

For local EAS commands, substitute the maintainer-provided values and export them first:

PowerShell:
```powershell
$env:EXPO_OWNER = "<expo-owner>"
$env:EXPO_PROJECT_ID = "<existing-project-uuid>"
npx eas-cli@27.7.2 project:info
```

Bash:
```bash
export EXPO_OWNER="<expo-owner>"
export EXPO_PROJECT_ID="<existing-project-uuid>"
npx eas-cli@27.7.2 project:info
```

If values are stored in an ignored local environment file, explicitly load them into the shell with your trusted environment loader before invoking EAS. Never commit that file.
