# What `node` as PID 1 does: adopts orphans, waits only for its own child, never reaps the rest.
import ctypes, signal, subprocess, sys
ctypes.CDLL(None).prctl(36, 1)  # PR_SET_CHILD_SUBREAPER
child = subprocess.Popen(sys.argv[1:])
signal.signal(signal.SIGTERM, lambda *_: child.terminate())
child.wait()
signal.pause()
