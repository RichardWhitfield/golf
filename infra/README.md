# Infrastructure

One DynamoDB table behind one Lambda Function URL. Deployed by hand, never from CI —
deploying from a public repo's Actions would require AWS credentials, and this design
otherwise needs none (D22).

Two stacks, both in `ap-southeast-2`:

| Stack | Contents |
|---|---|
| `golf-store` | table, function, Function URL |
| `golf-budget` | `$1` monthly spend alert |

They are separate so that redeploying the store does not need the alert's email parameter every
time — `aws cloudformation deploy` does not reuse previous parameter values.

## Deploy

### Pick the account first

This stack belongs in the **personal** account, `556684849777` — profile `rich-personal`.
The `default` profile in this workspace is a read-only user in a *different* account and
cannot deploy, deliberately.

Export the profile for the whole session rather than passing `--profile` per command. A
single forgotten flag would put one resource in the wrong account, which is far harder to
notice than a failure:

    export AWS_PROFILE=rich-personal
    aws sts get-caller-identity        # expect Account 556684849777

Every command below assumes that is set.

**The SAM CLI is not required.** `AWS::Serverless-2016-10-31` is a CloudFormation *transform*
and is expanded server-side; SAM CLI only automates zipping the code and uploading it, which
`aws cloudformation package` has always done. There is no behavioural difference in the
deployed stack.

One-off, to hold the code zip. CloudFormation cannot take a local file, and the handler is
too large for an inline `ZipFile`:

    aws s3 mb s3://golf-store-artifacts-556684849777 --region ap-southeast-2

Then, to deploy or redeploy:

    cd infra
    aws cloudformation package \
      --template-file template.yaml \
      --s3-bucket golf-store-artifacts-556684849777 \
      --output-template-file packaged.yaml
    aws cloudformation deploy \
      --region ap-southeast-2 \
      --stack-name golf-store \
      --template-file packaged.yaml \
      --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND

    aws cloudformation describe-stacks --region ap-southeast-2 \
      --stack-name golf-store \
      --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text

`CAPABILITY_IAM` covers the function's execution role; `CAPABILITY_AUTO_EXPAND` covers the
serverless transform itself. `packaged.yaml` is build output — gitignored, and one command to
regenerate.

`aws cloudformation deploy` exits non-zero with `No changes to deploy` when nothing changed.
That is success, not failure.

<details>
<summary>With the SAM CLI, if you have it</summary>

    cd infra
    sam build
    sam deploy --guided --region ap-southeast-2 --stack-name golf-store

It provisions its own artifact bucket, so the `s3 mb` step is unnecessary.
</details>

Then the spend alert, once:

    aws cloudformation deploy \
      --region ap-southeast-2 \
      --stack-name golf-budget \
      --template-file budget.yaml \
      --parameter-overrides AlertEmail=you@example.com

**Nothing to confirm.** AWS Budgets emails its subscribers directly.

This replaced a CloudWatch `AWS/Billing` alarm with an SNS topic and an email subscription. An
SNS email subscription must be confirmed by fetching a link, and its *unsubscribe* link is a
plain GET carrying a token — Chrome's link prefetching fetched that link from the "Subscription
confirmed!" page without anyone clicking it, so the subscription went from `PendingConfirmation`
straight to `Deleted`, twice. The alarm meanwhile reported `StateValue: OK` with a valid
`AlarmActions` ARN, so it looked entirely healthy while notifying nobody.

Check it with:

    aws budgets describe-subscribers-for-notification --account-id 556684849777 \
      --budget-name golf \
      --notification NotificationType=ACTUAL,ComparisonOperator=GREATER_THAN,Threshold=100,ThresholdType=PERCENTAGE

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
`@aws-sdk/client-dynamodb`. Add an `infra/function/package.json` depending on it, run
`npm install` in that directory, and repackage — `aws cloudformation package` zips whatever
is in `function/`, `node_modules` included. The handler code does not change. (It is already
a **dev**Dependency at the repo root so the tests can run — that copy is not deployed.)

## Restore

Writes are unauthenticated by decision (D19), so point-in-time recovery is the safety net.

    aws dynamodb restore-table-to-point-in-time \
      --region ap-southeast-2 \
      --source-table-name golf \
      --target-table-name golf-restored \
      --restore-date-time 2026-08-05T09:00:00Z

Restore **beside** the live table, check it, then swap. Never restore over `golf`.

The `Retain` deletion policy means `aws cloudformation delete-stack` leaves the table behind
on purpose. The corollary: after tearing the stack down, a redeploy **fails** trying to create
a table named `golf` that still exists. Import it back into the new stack, or rename it.
