"""Distil the generated app-server schema down to a committable list.

The schema itself is 4.2 MB and regenerable; the method names are what a
reader of the report actually needs.
"""
import json
import os

BASE = 'raw/app-server-schema'
OUT = 'raw/app-server-surface.txt'


def methods(path):
    d = json.load(open(path))
    found = []

    def walk(n):
        if isinstance(n, dict):
            m = n.get('properties', {}).get('method', {})
            if 'const' in m:
                found.append(m['const'])
            if 'enum' in m:
                found.extend(m['enum'])
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(d)
    return sorted(set(found))


with open(OUT, 'w') as f:
    for name, label in (
        ('ClientRequest', 'client -> server requests'),
        ('ServerRequest', 'server -> client requests (the return channel)'),
        ('ServerNotification', 'server -> client notifications'),
        ('ClientNotification', 'client -> server notifications'),
    ):
        p = os.path.join(BASE, f'{name}.json')
        if not os.path.exists(p):
            f.write(f'# {name}: schema not generated\n\n')
            continue
        ms = methods(p)
        f.write(f'## {label} ({len(ms)})\n')
        for m in ms:
            f.write(f'  {m}\n')
        f.write('\n')
print('written', OUT)
