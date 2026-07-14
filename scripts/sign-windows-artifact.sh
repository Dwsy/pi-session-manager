#!/usr/bin/env bash
set -euo pipefail

artifact=${1:?missing artifact path}
if [[ -z "${WINDOWS_SIGNTOOL_PATH:-}" ]]; then
  echo "WINDOWS_SIGNTOOL_PATH is required for Authenticode signing" >&2
  exit 2
fi
if [[ -z "${WINDOWS_SIGN_CERT_SHA1:-}" ]]; then
  echo "WINDOWS_SIGN_CERT_SHA1 is required for Authenticode signing" >&2
  exit 2
fi
if [[ -z "${WINDOWS_SIGN_TIMESTAMP_URL:-}" ]]; then
  echo "WINDOWS_SIGN_TIMESTAMP_URL is required for Authenticode signing" >&2
  exit 2
fi

"$WINDOWS_SIGNTOOL_PATH" sign \
  /fd SHA256 \
  /sha1 "$WINDOWS_SIGN_CERT_SHA1" \
  /tr "$WINDOWS_SIGN_TIMESTAMP_URL" \
  /td SHA256 \
  "$artifact"
