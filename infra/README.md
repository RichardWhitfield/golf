# Infrastructure

One DynamoDB table behind one Lambda Function URL. Deployed by hand, never from CI —
deploying from a public repo's Actions would require AWS credentials, and this design
otherwise needs none (D22).

Two stacks, because they must live in different regions:

| Stack | Region | Contents |
|---|---|---|
| `golf-store` | `ap-southeast-2` | table, function, Function URL |
| `golf-billing-alarm` | `us-east-1` | SNS topic, `$1` estimated-charges alarm |

`AWS/Billing` metrics are published in `us-east-1` **only**, whatever region the resources sit
in. An alarm on that metric created anywhere else sits in `INSUFFICIENT_DATA` for ever and
never fires.

## Deploy

Needs credentials that can write. The `claude-code-readonly` IAM user in this workspace
cannot deploy, deliberately — run these yourself, or with an admin profile.

**With the SAM CLI**, which provisions its own artifact bucket:

    cd infra
    sam build
    sam deploy --guided --region ap-southeast-2 --stack-name golf-store

**Or with the `aws` CLI alone**, if SAM is not installed. The `AWS::Serverless` transform runs
server-side in CloudFormation, so only the code upload needs doing locally:

    cd infra
    aws s3 mb s3://golf-store-artifacts-125969980812 --region ap-southeast-2   # once
    aws cloudformation package \
      --template-file template.yaml \
      --s3-bucket golf-store-artifacts-125969980812 \
      --output-template-file packaged.yaml
    aws cloudformation deploy \
      --region ap-southeast-2 \
      --stack-name golf-store \
      --template-file packaged.yaml \
      --capabilities CAPABILITY_IAM

`packaged.yaml` is build output — it is gitignored, and regenerating it is one command.

Then the alarm, once:

    aws cloudformation deploy \
      --region us-east-1 \
      --stack-name golf-billing-alarm \
      --template-file billing-alarm.yaml \
      --parameter-overrides AlarmEmail=you@example.com

**Confirm the SNS subscription from your inbox**, or the alarm cannot notify you. Until you
do, the subscription reads `PendingConfirmation` and the alarm is decorative.

The `golf-store` stack outputs `ApiUrl`. Put it in two places:

- `.env` as `VITE_API_URL`, for local development.
- The repository **variable** `API_URL` — Settings → Secrets and variables → Actions →
  **Variables**, not Secrets. The URL is public by design and ships in `dist/`; filing a
  non-secret as a secret blurs the rule that matters.

## Verify

    API=https://xxxx.lambda-url.ap-southeast-2.on.aws
    curl -sS "$API/sessions"
    curl -sS -X PUT "$API/sessions/smoke-1" -H 'content-type: application/json' \
      -d '{"id":"smoke-1","type":"practice","date":"2026-08-05","location":"home","entries":[]}'
    curl -sS "$API/sessions"
    curl -sS -X PUT "$API/sessions/smoke-1" -H 'content-type: application/json' -d '{"id":"smoke-1"}'
    curl -sS -X DELETE "$API/sessions/smoke-1"

Expected: an empty list, `{"ok":true}`, the session listed, a **400** with a readable
message, then `{"ok":true}`.

The fourth call is the one worth watching. Writes are unauthenticated, so that rejection is
the only thing stopping an open endpoint being used to store a shape the app cannot parse.

If the first call returns a 500 mentioning module resolution, the runtime does not ship
`@aws-sdk/client-dynamodb`. Add an `infra/package.json` depending on it and let `sam build`
install it; the handler code does not change. (It is already a **dev**Dependency at the repo
root so the tests can run — that copy is not deployed.)

## Restore

Writes are unauthenticated by decision (D19), so point-in-time recovery is the safety net.

    aws dynamodb restore-table-to-point-in-time \
      --region ap-southeast-2 \
      --source-table-name golf \
      --target-table-name golf-restored \
      --restore-date-time 2026-08-05T09:00:00Z

Restore **beside** the live table, check it, then swap. Never restore over `golf`.

The `Retain` deletion policy means `sam delete` leaves the table behind on purpose.
