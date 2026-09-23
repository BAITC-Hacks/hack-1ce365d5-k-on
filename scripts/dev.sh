#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Prefer a system installation; this checkout also supports a local Node runtime.
if ! command -v node >/dev/null 2>&1 && [[ -x .tools/node/bin/node ]]; then
  export PATH="$PWD/.tools/node/bin:$PATH"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo 'Install Node.js 22.18+ and run npm ci first.' >&2
  exit 1
fi
if [[ -x .venv/bin/python ]]; then
  app_python=.venv/bin/python
else
  app_python=python3
fi
if [[ ! -d node_modules ]]; then
  echo 'Run npm ci before starting the app.' >&2
  exit 1
fi

server_pids=()
cleanup() {
  trap - EXIT INT TERM
  if ((${#server_pids[@]})); then
    kill "${server_pids[@]}" 2>/dev/null || true
    wait "${server_pids[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Resolve one target for both the backend launcher and Vite. Process values win.
api_setup="$("$app_python" - <<'PY'
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

from dotenv import load_dotenv

load_dotenv(Path.cwd() / '.env', override=False)
target = os.environ.get('DJANGO_API_TARGET') or 'http://127.0.0.1:8000'
try:
    parsed = urlsplit(target)
    port = parsed.port
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.query or parsed.fragment or port == 0
            or any(ord(character) < 32 for character in target)):
        raise ValueError
except ValueError:
    sys.exit('DJANGO_API_TARGET must be an http(s) base URL without credentials, query or fragment.')

# An existing custom backend may include HTTPS, another host, or a path prefix.
try:
    with urlopen(target.rstrip('/') + '/api/catalog', timeout=2) as response:
        catalog = json.load(response)
    available = (isinstance(catalog, dict)
                 and isinstance(catalog.get('districts'), list)
                 and isinstance(catalog.get('measures'), list))
except Exception:
    available = False

if available:
    action = 'reuse'
elif (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost')
      and parsed.path in ('', '/')):
    action = f'{parsed.hostname}:{port if port is not None else 80}'
else:
    sys.exit(f'Start the Django API at {target} before launching the app.')

print(action)
print(target)
PY
)"
backend_action="${api_setup%%$'\n'*}"
api_target="${api_setup#*$'\n'}"
export DJANGO_API_TARGET="$api_target"

# Reuse a backend already started from the IDE; never stop the user's server.
if [[ "$backend_action" == reuse ]]; then
  echo "Using the Django API already running at $api_target"
else
  "$app_python" manage.py migrate --noinput
  "$app_python" manage.py runserver "$backend_action" --noreload &
  server_pids+=("$!")
fi
node node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort &
server_pids+=("$!")
# Stop our processes if either exits, or when Ctrl-C is pressed.
wait -n "${server_pids[@]}"
