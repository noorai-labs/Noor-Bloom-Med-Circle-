# Development and QA backends

Development account: `5f60fb51e83a434162045c3ba7049f9a`.
Production configuration stays in `backend/wrangler.jsonc`; nonproduction uses `backend/wrangler.nonprod.jsonc`.

| Branch | Worker | D1 | Private R2 bucket |
| --- | --- | --- | --- |
| dev | bloom-med-api-dev | bloom-med-dev | bloom-med-records-dev |
| qa | bloom-med-api-qa | bloom-med-qa | bloom-med-records-qa |

Only approved PR merges deploy. ANC-DOMINATER must approve the latest head; validation passes before migrations and deployment. Promote dev to qa with a reviewed PR. This workflow does not change the mobile app API URL or deploy production.

Create GitHub environments `dev` and `qa`, restrict each to its matching branch, and add `CLOUDFLARE_API_TOKEN` to each. Use a dedicated token for the development Cloudflare account with Workers Scripts Edit, D1 Edit and the permissions required to deploy R2 and Durable Object bindings. R2 buckets must already exist. Do not store Wrangler OAuth credentials in GitHub. Interns do not need deployment tokens.

Each Worker needs its own `CLERK_JWT_KEY` public PEM verification key (the existing development Clerk instance can be shared). Configure independent LiveKit credentials and optional push credentials separately before testing those integrations; production secrets are not copied automatically.

Local backend: `npx --no-install wrangler dev --config backend/wrangler.nonprod.jsonc --env dev`. Local D1 and R2 are emulated; do not add `--remote` for ordinary local development. Use test accounts and synthetic records.

Workers/D1 Free allowances are shared across the account. R2 can charge beyond the free allowance. Keep file usage small and monitor billing; alerts are not hard spending caps. No paid-plan upgrade is part of this setup.

## Provisioning status

Both D1 databases are created and migrations 0001–0005 are applied. R2 activation in the development account is pending the owner's payment setup. Buckets, Worker deployments and Worker JWT bindings are not configured yet. No production data was copied.

After enabling R2, create both named private buckets, deploy each environment and set its Clerk JWT public PEM key. Set the account's workers.dev subdomain if Cloudflare requests it. Smoke-test `/health` and authenticated access before distributing API URLs.

The CI deployment workflow is prepared but must land through review in the target branches. Its Cloudflare token and GitHub environments still need configuration. QA branch protection should require the same review and validation policy as dev before accepting promotions.
