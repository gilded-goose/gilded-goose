#!/bin/sh
# Gate: core/ and server/ run on Node's strip-only TypeScript. Constructor parameter
# properties compile under Vitest (esbuild) but crash Node at import, so tests pass
# while the server dies. Project lesson 5. Exits 1 on any match.
set -e
if grep -rnE "constructor\((private|public|readonly|protected) " trust/src core/src server/src scripts --include='*.ts'; then
  echo "check-node-ts FAIL: constructor parameter properties are not supported by Node's type stripping" >&2
  exit 1
fi
echo "check-node-ts ok: no constructor parameter properties"
