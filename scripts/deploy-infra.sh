#!/usr/bin/env bash
#
# Deploy the `golf-store` stack: the DynamoDB table, the Lambda and its Function URL.
#
# **By hand, never from CI (D25).** Deploying from a public repo's Actions would need AWS
# credentials in the repo, which is the one thing the rest of this design avoids — the ingest
# holds none, and `API_URL` is a public variable rather than a secret. The CI guard below makes
# that a rule the code enforces rather than a paragraph in a README.
#
# Usage:
#   npm run deploy:infra
#   AWS_PROFILE=other npm run deploy:infra

set -euo pipefail

# The account the stack lives in. The profile is a convenience; **this** is the guard, because
# credentials are ambient and the wrong ones fail in a way that does not name the real problem:
# a read-only user on a different account reports "stack does not exist", which reads like the
# stack was deleted rather than like you are looking in the wrong place.
readonly EXPECTED_ACCOUNT=556684849777
readonly REGION=ap-southeast-2
readonly STACK=golf-store
readonly BUCKET=golf-store-artifacts-556684849777

export AWS_PROFILE="${AWS_PROFILE:-rich-personal}"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

die() { printf '\n\033[31merror\033[0m  %s\n' "$1" >&2; exit 1; }
step() { printf '\n\033[33m==>\033[0m %s\n' "$1"; }

# ---------------------------------------------------------------------------
# Guards, all of them before anything is uploaded or changed.
# ---------------------------------------------------------------------------

if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
  die "infra/ is deployed by hand, never from CI (D25). Refusing to run."
fi

step "Checking credentials"
account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"

if [ -z "$account" ]; then
  die "Could not read an AWS identity for profile '$AWS_PROFILE'.
       If it is an SSO profile, run:  aws sso login --profile $AWS_PROFILE"
fi

if [ "$account" != "$EXPECTED_ACCOUNT" ]; then
  die "Wrong AWS account.
       profile '$AWS_PROFILE' is account $account
       golf-store lives in account $EXPECTED_ACCOUNT
       Set AWS_PROFILE to one that reaches it, e.g.  AWS_PROFILE=rich-personal npm run deploy:infra"
fi
printf '    account %s via profile %s\n' "$account" "$AWS_PROFILE"

# The handler stamps `schemaVersion` on every item it writes, and CLAUDE.md requires the two
# constants move in the same commit. A deploy is the moment drift starts doing damage: the
# browser would write documents the store labels with a different version than the one that
# describes their shape.
step "Checking SCHEMA_VERSION parity"
app_version="$(sed -n 's/^export const SCHEMA_VERSION = \([0-9]\+\).*/\1/p' src/lib/storage/migrations.ts)"
fn_version="$(sed -n 's/^const SCHEMA_VERSION = \([0-9]\+\).*/\1/p' infra/function/handler.mjs)"

[ -n "$app_version" ] && [ -n "$fn_version" ] || die "Could not read SCHEMA_VERSION from both files."

if [ "$app_version" != "$fn_version" ]; then
  die "SCHEMA_VERSION has drifted.
       src/lib/storage/migrations.ts   = $app_version
       infra/function/handler.mjs      = $fn_version
       These must move together — see CLAUDE.md. Fix before deploying."
fi
printf '    both at %s\n' "$app_version"

# ---------------------------------------------------------------------------
# Deploy.
# ---------------------------------------------------------------------------

step "Packaging"
(cd infra && aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket "$BUCKET" \
  --output-template-file packaged.yaml >/dev/null)

step "Deploying $STACK to $REGION"
# `aws cloudformation deploy` exits non-zero with "No changes to deploy" when nothing changed.
# That is success, not failure — see infra/README.md. `set -e` would otherwise abort here on the
# most common outcome of a re-run.
set +e
out="$(cd infra && aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK" \
  --template-file packaged.yaml \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND 2>&1)"
code=$?
set -e

if [ $code -ne 0 ]; then
  if printf '%s' "$out" | grep -qi 'No changes to deploy'; then
    printf '    no changes — the stack already matches this template\n'
  else
    printf '%s\n' "$out" >&2
    die "Deploy failed."
  fi
else
  printf '%s\n' "$out" | sed 's/^/    /'
fi

# ---------------------------------------------------------------------------
# Verify. This project's rule is to verify a deploy rather than assume it.
# ---------------------------------------------------------------------------

step "Verifying the deployed Function URL"
api="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)"
[ -n "$api" ] && [ "$api" != "None" ] || die "Stack has no ApiUrl output."
api="${api%/}"

failed=0
for route in /sessions /settings /destinations; do
  status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$api$route" || echo 000)"
  if [ "$status" = "200" ]; then
    printf '    %-14s %s\n' "GET $route" "$status"
  else
    printf '    \033[31m%-14s %s\033[0m\n' "GET $route" "$status"
    failed=1
  fi
done

[ $failed -eq 0 ] || die "A route the deployed handler should serve did not answer with 200."

printf '\n\033[32mdone\033[0m  %s\n' "$api"
printf '      Verify in a browser with site data cleared — a populated cache proves nothing.\n\n'
