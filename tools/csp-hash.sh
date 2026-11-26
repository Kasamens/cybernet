#!/bin/sh
# Recompute the CSP hash for the inline importmap in index.html and write it into the CSP meta tag.
# Run after editing the importmap. Usage: sh tools/csp-hash.sh
set -e
cd "$(dirname "$0")/.."
MAP=$(sed -n 's/.*<script type="importmap">\(.*\)<\/script>.*/\1/p' index.html)
HASH=$(printf '%s' "$MAP" | openssl dgst -sha256 -binary | openssl base64)
sed -i.bak -E "s#'sha256-[^']*'#'sha256-$HASH'#" index.html && rm index.html.bak
echo "importmap sha256-$HASH"
