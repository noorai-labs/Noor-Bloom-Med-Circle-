# Development and QA backends

Development account: `5f60fb51e83a434162045c3ba7049f9a`.
Production configuration stays in `backend/wrangler.jsonc`; nonproduction uses `backend/wrangler.nonprod.jsonc`.

| Branch | Worker | D1 | Private R2 bucket |
| --- | --- | --- | --- |
| dev | bloom-med-api-dev | bloom-med-dev | bloom-med-storage / dev/ |
| qa | bloom-med-api-qa | bloom-med-qa | bloom-med-storage / qa/ |

Only approved PR merges deploy. ANC-DOMINATER must approve the latest head; validation passes before migrations and deployment. Promote dev to qa with a reviewed PR. This workflow does not change the mobile app API URL or deploy production.

Create GitHub environments `dev` and `qa`, restrict each to its matching branch, and add `CLOUDFLARE_API_TOKEN` to each. Use a dedicated token for the development Cloudflare account with Workers Scripts Edit, D1 Edit and the permissions required to deploy R2 and Durable Object bindings. R2 buckets must already exist. Do not store Wrangler OAuth credentials in GitHub. Interns do not need deployment tokens.

Each Worker needs its own `CLERK_JWT_KEY` public PEM verification key (the existing development Clerk instance can be shared). Configure independent LiveKit credentials and optional push credentials separately before testing those integrations; production secrets are not copied automatically.

Local backend: `npx --no-install wrangler dev --config backend/wrangler.nonprod.jsonc --env dev`. Local D1 and R2 are emulated; do not add `--remote` for ordinary local development. Use test accounts and synthetic records.

Workers/D1 Free allowances are shared across the account. R2 can charge beyond the free allowance. Keep file usage small and monitor billing; alerts are not hard spending caps. No paid-plan upgrade is part of this setup.

## Provisioning status

Dev and QA databases, Workers and Clerk public JWT bindings are deployed. Health checks return 200 and unauthenticated state requests return 401. All files use the one private `bloom-med-storage` bucket with server-controlled `dev/`, `qa/` and `main/` prefixes. Branding is served through an exact Worker logo route. R2 is enabled and the temporary separate buckets were removed after verification.

PR #5 supplies the storage prefix helper and migrated main-backend configuration. Merge or incorporate PR #5 before activating this deployment workflow. This branch must be up to date with dev before merging. The GitHub Cloudflare CI token and environment restrictions still require setup.

The main data migration is a snapshot with 18 verified tables and checksum-verified record/branding files. Old installed apps still use the original endpoint. Follow the controlled cutover notes in `docs/cloudflare-account-migration.md`; dev and qa do not contain copied patient data.

QA branch protection is active with the same required checks and review rules as dev. Promote workflows and CODEOWNERS through owner-reviewed PRs so the checks run and the sole approver identity is enforced in qa.
