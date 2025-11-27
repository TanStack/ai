#!/bin/bash
set -e

# Run clean scripts in all workspace packages
pnpm run -r clean

# Remove root node_modules
rm -rf node_modules

# Remove all .gitignored build artifacts
find . -type d \( -name 'node_modules' -o -name '.git' \) -prune -o \
  -type d \( \
    -name 'dist' \
    -o -name 'build' \
    -o -name 'coverage' \
    -o -name '.cache' \
    -o -name '.vite' \
    -o -name '.output' \
    -o -name '.temp' \
    -o -name '.tmp' \
    -o -name '.nyc_output' \
  \) -exec rm -rf {} + 2>/dev/null || true

# Remove TypeScript build info files
find . -type d \( -name 'node_modules' -o -name '.git' \) -prune -o \
  -name '*.tsbuildinfo' -type f -delete 2>/dev/null || true
