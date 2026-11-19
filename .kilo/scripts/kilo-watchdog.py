#!/usr/bin/env python3
"""Non-invasive LaceFrame activity watchdog. Checks heartbeat and repo activity, not hidden thoughts.

Optional: set KILO_WATCH_LOG to a plaintext log file Kilo actually produces. The
watchdog can then flag repeated identical log lines. It never stops Kilo.
"""
import os
from pathlib import Path
import subprocess
import time
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
HEARTBEAT = ROOT / '.kilo' / 'agent-progress.txt'
WATCH = [ROOT / p for p in ('src', 'scripts', 'tests', 'docs', '.kilo/agents')]
LOG = Path(os.environ['KILO_WATCH_LOG']).expanduser() if os.environ.get('KILO_WATCH_LOG') else None
STALE_MIN = int(os.environ.get('KILO_WATCH_MINUTES', '12'))
POLL = 30

def modified_at():
    latest = 0.0
    paths = WATCH + [HEARTBEAT]
    for p in paths:
        try:
            if p.is_file():
                latest = max(latest, p.stat().st_mtime)
            elif p.is_dir():
                for folder, dirs, files in os.walk(p):
                    dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'dist', 'out', 'build')]
                    for name in files:
                        try:
                            latest = max(latest, (Path(folder) / name).stat().st_mtime)
                        except OSError:
                            pass
        except OSError:
            pass
    return latest

def head():
    p = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--verify', 'HEAD'],capture_output=True,text=True)
    return p.stdout.strip() if p.returncode == 0 else ''

def log_repetition():
    if not LOG or not LOG.is_file():
        return False
    try:
        # Read only the tail. Some logs contain secrets: never print their content.
        with LOG.open('rb') as f:
            f.seek(max(0, f.seek(0, 2) - 250_000))
            content = f.read().decode('utf-8', 'replace')
        lines = [ln.strip() for ln in content.splitlines() if len(ln.strip()) > 35]
        if len(lines) < 15:
            return False
        tail = lines[-24:]
        return max(tail.count(s) for s in set(tail)) >= 6
    except OSError:
        return False

def alert(message):
    print('\a' + f'[{datetime.now():%H:%M:%S}] ⚠️  {message}', flush=True)
    if os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY'):
        try:
            subprocess.run(['notify-send', 'LaceFrame Kilo Watchdog', message], timeout=3, check=False,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

print(f'Watching {ROOT}; warning after {STALE_MIN} minutes without observed repository/heartbeat activity.')
print('This is a heuristic, not a reliable Kilo session monitor. Ctrl+C stops the watchdog.')
last_activity = max(modified_at(), time.time())
last_head = head()
last_alert_at = 0.0
while True:
    now = time.time()
    current_head = head()
    changed = modified_at()
    if current_head != last_head:
        last_head = current_head
        changed = now
        print(f'[{datetime.now():%H:%M:%S}] New commit observed.', flush=True)
    last_activity = max(last_activity, changed)
    repeated = log_repetition()
    idle = now - last_activity
    if (repeated or idle >= STALE_MIN * 60) and now - last_alert_at > STALE_MIN * 60:
        msg = ('Repeated log messages detected (verify manually).' if repeated else
               f'No tracked activity for {int(idle // 60)} minutes; check Kilo manually.')
        alert(msg)
        last_alert_at = now
    time.sleep(POLL)
