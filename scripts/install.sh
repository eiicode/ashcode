#!/usr/bin/env sh
# Install ashcode for Linux/macOS: verify runtimes, install deps, add a launcher.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BIN_DIR="${HOME}/.local/bin"
LAUNCHER="${BIN_DIR}/ashcode"

echo "ashcode installer"
echo "  app: ${ROOT}"

command -v node >/dev/null 2>&1 || { echo "Node.js >=24.9 is required (the DSH runtime ships native addons)" >&2; exit 1; }
NODE_VERSION=$(node -p 'process.versions.node')
NODE_MAJOR=${NODE_VERSION%%.*}
NODE_REST=${NODE_VERSION#*.}
NODE_MINOR=${NODE_REST%%.*}
if [ "${NODE_MAJOR}" -lt 24 ] || { [ "${NODE_MAJOR}" -eq 24 ] && [ "${NODE_MINOR}" -lt 9 ]; }; then
  echo "Node.js >=24.9 required, found ${NODE_VERSION}" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "  bun: missing, installing via npm..."
  npm install -g bun
fi

BUN_VERSION=$(bun --version 2>/dev/null | head -n1)
BUN_MAJOR=${BUN_VERSION%%.*}
BUN_REST=${BUN_VERSION#*.}
BUN_MINOR=${BUN_REST%%.*}
BUN_PATCH=${BUN_REST#*.}
BUN_PATCH=$(printf '%s' "$BUN_PATCH" | sed 's/[^0-9].*$//')
if [ -z "${BUN_PATCH}" ]; then BUN_PATCH=0; fi
if [ "${BUN_MAJOR}" -lt 1 ] || { [ "${BUN_MAJOR}" -eq 1 ] && [ "${BUN_MINOR}" -lt 3 ]; } || { [ "${BUN_MAJOR}" -eq 1 ] && [ "${BUN_MINOR}" -eq 3 ] && [ "${BUN_PATCH}" -lt 14 ]; }; then
  echo "Bun >=1.3.14 required, found ${BUN_VERSION}" >&2
  exit 1
fi

if [ ! -d "${ROOT}/node_modules/@deepseek-ai/dsh" ]; then
  echo "  installing dependencies (first run)..."
  ( cd "${ROOT}" && npm install --legacy-peer-deps --no-audit --no-fund )
fi

mkdir -p "${BIN_DIR}"
cat > "${LAUNCHER}" <<EOF
#!/usr/bin/env sh
exec bun "${ROOT}/bin/ashcode.mjs" "\$@"
EOF
chmod +x "${LAUNCHER}"

echo ""
echo "Installed: ${LAUNCHER}"
echo "Make sure ${BIN_DIR} is on PATH, then run: ashcode"
