#!/bin/bash
set -euo pipefail
umask 077
keychain_password=$(openssl rand -hex 32)
echo "::add-mask::$keychain_password"
keychain="$RUNNER_TEMP/nomi-signing.keychain-db"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 3600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
printf '%s' "$CERTIFICATE" | base64 --decode > "$RUNNER_TEMP/developer-id.p12"
security import "$RUNNER_TEMP/developer-id.p12" -P "$CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$keychain"
# Some PKCS#12 exports already contain the chain; importing it twice is an error.
if ! security find-certificate -a -Z "$keychain" | grep -q 'SHA-256 hash: 7AFC9D01A62F03A2DE9637936D4AFE68090D2DE18D03F29C88CFB0B1BA63587F'; then
  curl --fail --location --retry 3 https://www.apple.com/certificateauthority/DeveloperIDCA.cer -o "$RUNNER_TEMP/developer-id-ca.cer"
  echo '7afc9d01a62f03a2de9637936d4afe68090d2de18d03f29c88cfb0b1ba63587f  '"$RUNNER_TEMP/developer-id-ca.cer" | shasum -a 256 --check
  security import "$RUNNER_TEMP/developer-id-ca.cer" -k "$keychain"
fi
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
python3 - "$keychain" <<'PY'
import shlex, subprocess, sys
existing = shlex.split(subprocess.check_output(['security', 'list-keychains', '-d', 'user'], text=True))
subprocess.run(['security', 'list-keychains', '-d', 'user', '-s', sys.argv[1], *[p for p in existing if p != sys.argv[1]]], check=True)
PY
printf '%s' "$ASC_PRIVATE_KEY" > "$RUNNER_TEMP/notary.p8"
rm "$RUNNER_TEMP/developer-id.p12"
