#!/usr/bin/env bash
set -euo pipefail

echo "Installing Akita DAO CLI..."

# Install bun if not present
if ! command -v bun &> /dev/null; then
  echo "Bun not found. Installing..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  echo ""
fi

# Install the CLI globally
bun add -g @akta/dao-cli

echo ""
echo "Done! Run 'akita-dao info' to get started."
