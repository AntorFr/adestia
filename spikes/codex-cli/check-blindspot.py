"""Did the real model actually run a command, and did the client hear about it?"""
import json

d = json.load(open('raw-auth/real-appserver.json'))
types = sorted({
    n['params']['item']['type']
    for n in d['notifications']
    if n['method'] in ('item/started', 'item/completed')
})
print('item types the client saw:', types)
print()
for n in d['notifications']:
    if n['method'] == 'item/completed' and n['params']['item'].get('type') == 'agentMessage':
        print(' agent said:', repr(n['params']['item'].get('text'))[:300])
print()
usages = [n['params']['tokenUsage']['total']['totalTokens'] for n in d['notifications'] if n['method'] == 'thread/tokenUsage/updated']
print('cumulative token readings (one per model call):', usages)
print('server->client requests:', [r['method'] for r in d['serverRequests']])
