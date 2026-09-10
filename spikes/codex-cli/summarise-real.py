"""Distil the authenticated capture into facts fit for a committed report.

Account identifiers, tokens and anything that names the human are redacted
here, not in the raw file — the raw file stays out of git.
"""
import json

SECRET_KEYS = {
    'email', 'accountId', 'account_id', 'id', 'name', 'displayName',
    'workspaceId', 'workspace_id', 'organizationId', 'chatgptAccountId',
    'access_token', 'id_token', 'refresh_token', 'planDisplayName',
}


def redact(o):
    if isinstance(o, dict):
        return {k: ('<redacted>' if k in SECRET_KEYS and o[k] not in (None, [], {}) else redact(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [redact(x) for x in o]
    return o


d = json.load(open('raw-auth/real-appserver.json'))

for key in ('account/read', 'account/rateLimits/read', 'account/usage/read', 'modelProvider/capabilities/read'):
    print(f'===== {key}   ({d.get(key + " __ms")} ms)')
    print(json.dumps(redact(d[key]), indent=1)[:1800])
    print()

print('===== model/list (ids only)')
data = d['model/list'].get('data', []) if isinstance(d['model/list'], dict) else []
for m in data:
    efforts = ','.join(e['reasoningEffort'] for e in (m.get('supportedReasoningEfforts') or []))
    print(f"  {m.get('id'):<22} default={m.get('defaultReasoningEffort'):<7} hidden={m.get('hidden')} efforts={efforts}")
print()

print('===== notifications, in order (method + the fields a driver reads)')
for n in d['notifications']:
    p = n.get('params', {}) or {}
    extra = ''
    if n['method'] == 'item/started' or n['method'] == 'item/completed':
        it = p.get('item', {})
        extra = f" type={it.get('type')} status={it.get('status')} command={str(it.get('command'))[:60]}"
    if n['method'] == 'thread/tokenUsage/updated':
        extra = ' ' + json.dumps(p.get('tokenUsage', {}).get('total'))
    if n['method'] == 'account/rateLimits/updated':
        extra = ' ' + json.dumps(redact(p.get('rateLimits')))[:600]
    if n['method'] == 'turn/completed':
        extra = f" status={p.get('turn',{}).get('status')}"
    if n['method'] == 'mcpServer/startupStatus/updated':
        extra = f" {p.get('name')} {p.get('status')}"
    print(f"  {n['method']}{extra}")
print()
print('===== server->client requests:', [r['method'] for r in d['serverRequests']])
print('===== stderr lines:', len(d['stderr']))
for line in d['stderr'][:6]:
    print('  ', line[:200])
