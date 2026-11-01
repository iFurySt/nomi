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
# PKCS#12 contains only our identity; install Apple's pinned issuer certificate.
curl --fail --location --retry 3 https://www.apple.com/certificateauthority/DeveloperIDCA.cer -o "$RUNNER_TEMP/developer-id-ca.cer"
echo '7afc9d01a62f03a2de9637936d4afe68090d2de18d03f29c88cfb0b1ba63587f  '"$RUNNER_TEMP/developer-id-ca.cer" | shasum -a 256 --check
security import "$RUNNER_TEMP/developer-id-ca.cer" -k "$keychain"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" login.keychain-db
printf '%s' "$ASC_PRIVATE_KEY" > "$RUNNER_TEMP/notary.p8"
rm "$RUNNER_TEMP/developer-id.p12"
