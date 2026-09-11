#!/usr/bin/env python3
"""Drive an interactive CLI through a real pseudo-terminal.

Used by the test suite for the prompts, which only render on a TTY. Python's
pty module ships with every CPython on Unix, so this needs no native npm
module — node-pty would need `npm install-scripts approve` on each machine.

Usage: pty.py <workdir> <script> <command> [args...]
  <script> is a semicolon-separated list of steps:
     wait:SUBSTRING   block until SUBSTRING has appeared in the output
     send:KEY         send a key — down, up, enter, space, ctrlc, esc, tab,
                      or any literal text
     sleep:SECONDS    pause

Environment:
  PTY_COLS   terminal width the child sees (default 80)

The captured output (ANSI stripped) is printed, followed by a trailer line
  [[pty-steps-completed=N/M exit=E]]
"""
import fcntl
import os
import pty
import re
import select
import struct
import sys
import termios
import time

ANSI = re.compile(rb"\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[=>]|\r")
KEYS = {
    "down": b"\x1b[B",
    "up": b"\x1b[A",
    "enter": b"\r",
    "space": b" ",
    "ctrlc": b"\x03",
    "esc": b"\x1b",
    "tab": b"\t",
}


def main():
    workdir, steps_raw, *cmd = sys.argv[1], sys.argv[2], *sys.argv[3:]
    steps = [s for s in steps_raw.split(";") if s]
    cols = int(os.environ.get("PTY_COLS", "80"))
    os.chdir(workdir)

    pid, fd = pty.fork()
    if pid == 0:
        os.environ["TERM"] = "xterm-256color"
        # The child sizes its own terminal before exec, so there is no window
        # in which the CLI could read a zero-width pty.
        fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, cols, 0, 0))
        os.execvp(cmd[0], cmd)

    buf = b""
    deadline = time.time() + float(os.environ.get("PTY_DEADLINE", "60"))
    step = 0
    exit_code = None

    while time.time() < deadline:
        r, _, _ = select.select([fd], [], [], 0.25)
        if r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                break
            if not chunk:
                break
            buf += chunk

        if step < len(steps):
            kind, _, val = steps[step].partition(":")
            plain = ANSI.sub(b"", buf).decode("utf8", "replace")
            if kind == "wait":
                if val in plain:
                    step += 1
                    continue
            elif kind == "send":
                os.write(fd, KEYS.get(val, val.encode()))
                time.sleep(0.35)
                step += 1
                continue
            elif kind == "sleep":
                time.sleep(float(val))
                step += 1
                continue
        elif not r:
            # All steps done and the output has gone quiet.
            try:
                wpid, status = os.waitpid(pid, os.WNOHANG)
                if wpid:
                    exit_code = os.waitstatus_to_exitcode(status)
                    break
            except ChildProcessError:
                break

    try:
        os.close(fd)
    except OSError:
        pass
    if exit_code is None:
        try:
            _, status = os.waitpid(pid, 0)
            exit_code = os.waitstatus_to_exitcode(status)
        except (ChildProcessError, OSError):
            exit_code = -1

    out = ANSI.sub(b"", buf).decode("utf8", "replace")
    sys.stdout.write(out)
    sys.stdout.write(f"\n[[pty-steps-completed={step}/{len(steps)} exit={exit_code}]]\n")


main()
