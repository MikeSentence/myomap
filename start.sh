#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 server.py
elif command -v python >/dev/null 2>&1; then
  exec python server.py
else
  echo "MyoMap needs Python 3 to serve the local 3D files."
  exit 1
fi
