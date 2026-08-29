import { describe, expect, it } from 'vitest'

import { ConfigError, parseConfig } from '../src/config.js'

function issuesOf(source: string): string[] {
  try {
    parseConfig(source)
  } catch (error) {
    if (error instanceof ConfigError) return [...error.issues]
    throw error
  }
  throw new Error('expected the config to be refused')
}

describe('defaults', () => {
  it('an empty file yields a working single-user instance', () => {
    const config = parseConfig('')
    expect(config.auth.mode).toBe('none')
    expect(config.driver.id).toBe('claude-code')
    expect(config.maxConcurrentTurns).toBe(3)
  })

  it('binds to loopback by default', () => {
    // With auth: none there is no gate at all. Binding an ungated agent to
    // every interface by default would ship a mistake to everyone who skips
    // the docs.
    expect(parseConfig('').host).toBe('127.0.0.1')
  })
})

describe('unknown settings', () => {
  it('are refused, not ignored', () => {
    // A typo is a setting the operator believes is on. Silence makes them
    // debug the feature instead of the spelling.
    expect(issuesOf('prt: 9000\n')).toEqual(['unknown setting "prt"'])
  })

  it('are reported alongside every other problem', () => {
    expect(issuesOf('nope: 1\nport: 99999\n')).toEqual([
      'unknown setting "nope"',
      'port must be an integer between 0 and 65535 (0 = pick a free port)',
    ])
  })
})

describe('auth modes', () => {
  it('rejects an unknown mode', () => {
    expect(issuesOf('auth:\n  mode: magic\n')[0]).toContain('auth.mode must be one of')
  })

  it('requires the oidc block when mode is oidc', () => {
    expect(issuesOf('auth:\n  mode: oidc\n')).toEqual([
      'auth.oidc is required when auth.mode is "oidc"',
    ])
  })

  it('names every missing oidc field at once', () => {
    expect(issuesOf('auth:\n  mode: oidc\n  oidc:\n    issuer: https://id.example\n')).toEqual([
      'auth.oidc.clientId is required',
      'auth.oidc.clientSecret is required',
      'auth.oidc.redirectUri is required',
    ])
  })

  it('defaults the groups claim rather than inventing a provider', () => {
    const config = parseConfig(
      [
        'auth:',
        '  mode: oidc',
        '  oidc:',
        '    issuer: https://id.example',
        '    clientId: golem',
        '    clientSecret: shhh',
        '    redirectUri: https://golem.example/auth/callback',
        '    allowedGroups: [staff]',
      ].join('\n'),
    )
    expect(config.auth.oidc?.groupsClaim).toBe('groups')
    expect(config.auth.oidc?.allowedGroups).toEqual(['staff'])
  })

  it('defaults the proxy header to remote-user', () => {
    expect(parseConfig('auth:\n  mode: proxy\n').auth.proxy?.userHeader).toBe('remote-user')
  })
})

describe('driver models', () => {
  it('accepts bare ids and labelled entries alike', () => {
    const config = parseConfig(
      ['driver:', '  models:', '    - claude-opus-5', '    - id: claude-sonnet-5', '      label: Sonnet'].join('\n'),
    )
    expect(config.driver.models).toEqual([
      { id: 'claude-opus-5' },
      { id: 'claude-sonnet-5', label: 'Sonnet' },
    ])
  })

  it('points at the offending entry', () => {
    expect(issuesOf('driver:\n  models:\n    - 42\n')).toEqual([
      'driver.models[0] must be a model id or {id, label}',
    ])
  })
})

describe('extensions', () => {
  it('separates discovery from activation', () => {
    // Directories are where plugins are FOUND; the three lists are what is
    // turned ON. A mounted folder must never activate itself.
    const config = parseConfig(
      ['extensions:', '  pluginsDir: /mnt/plugins', '  apps: [workbench]', '  tools: [git]'].join('\n'),
    )
    expect(config.extensions.pluginsDir).toBe('/mnt/plugins')
    expect(config.extensions.apps).toEqual(['workbench'])
    expect(config.extensions.features).toEqual([])
  })

  it('refuses a scalar where a list belongs', () => {
    expect(issuesOf('extensions:\n  apps: workbench\n')).toEqual([
      'extensions.apps must be a list of strings',
    ])
  })
})

describe('port', () => {
  it('accepts 0 as "pick a free port"', () => {
    expect(parseConfig('port: 0\n').port).toBe(0)
  })

  it('refuses a port beyond the range', () => {
    expect(issuesOf('port: 70000\n')).toEqual([
      'port must be an integer between 0 and 65535 (0 = pick a free port)',
    ])
  })
})

describe('malformed input', () => {
  it('reports invalid YAML as such', () => {
    expect(issuesOf('port: [unclosed\n')[0]).toContain('not valid YAML')
  })

  it('refuses a non-mapping document', () => {
    expect(issuesOf('- a\n- b\n')).toEqual(['the config file must be a YAML mapping'])
  })

  it('refuses a zero concurrency cap', () => {
    expect(issuesOf('maxConcurrentTurns: 0\n')).toEqual([
      'maxConcurrentTurns must be an integer >= 1',
    ])
  })
})

describe('environment overrides', () => {
  it('overrides only deployment-specific values', () => {
    // The FILE says what the instance IS; the ENVIRONMENT says where it runs.
    // A container cannot mount a different config for `host` alone.
    const config = parseConfig('auth:\n  mode: proxy\n', {
      GOLEM_HOST: '0.0.0.0',
      GOLEM_PORT: '9000',
      GOLEM_DATA_DIR: '/data',
      GOLEM_WORKSPACE: '/workspace',
    })
    expect(config).toMatchObject({ host: '0.0.0.0', port: 9000, dataDir: '/data' })
    expect(config.workspace.root).toBe('/workspace')
    // And what the file said about the instance is untouched.
    expect(config.auth.mode).toBe('proxy')
  })

  it('ignores an empty variable rather than blanking a setting', () => {
    expect(parseConfig('host: 10.0.0.1\n', { GOLEM_HOST: '' }).host).toBe('10.0.0.1')
  })

  it('works with no config file at all', () => {
    // How the container image runs before anyone writes a config.
    expect(parseConfig('', { GOLEM_HOST: '0.0.0.0' }).host).toBe('0.0.0.0')
  })

  it('substitutes ${VAR} so a secret never lands in the file', () => {
    const config = parseConfig(
      [
        'auth:',
        '  mode: oidc',
        '  oidc:',
        '    issuer: https://id.example',
        '    clientId: golem',
        '    clientSecret: ${OIDC_SECRET}',
        '    redirectUri: https://golem.example/auth/callback',
      ].join('\n'),
      { OIDC_SECRET: 'from-the-environment' },
    )
    expect(config.auth.oidc?.clientSecret).toBe('from-the-environment')
  })

  it('leaves an undefined placeholder visible instead of blanking it', () => {
    // Blanking turns a missing variable into "invalid client" from the IdP,
    // which names nothing an operator can act on.
    const config = parseConfig('dataDir: ${NOT_SET}\n', {})
    expect(config.dataDir).toBe('${NOT_SET}')
  })

  it('refuses a non-numeric port from the environment', () => {
    expect(() => parseConfig('', { GOLEM_PORT: 'eight-thousand' })).toThrow(/port must be/)
  })
})

describe('Kubernetes service links', () => {
  it('ignores a URL-shaped override the platform injected', () => {
    // A deployment whose Service is named `golem` gets
    // `GOLEM_PORT=tcp://10.43.0.1:8730` for free. Parsing it yielded NaN and
    // the instance refused to boot, blaming the port — found in the cluster,
    // on the first deploy.
    const config = parseConfig('port: 8730\n', {
      GOLEM_PORT: 'tcp://10.43.69.249:8730',
    } as NodeJS.ProcessEnv)
    expect(config.port).toBe(8730)
  })

  it('still honours a port an operator actually set', () => {
    const config = parseConfig('port: 8730\n', { GOLEM_PORT: '9000' } as NodeJS.ProcessEnv)
    expect(config.port).toBe(9000)
  })

  it('ignores service links on path overrides too', () => {
    // `GOLEM_DATA_DIR` collides the same way for a service of that name.
    const config = parseConfig('dataDir: /data\n', {
      GOLEM_DATA_DIR: 'tcp://10.43.0.9:8730',
    } as NodeJS.ProcessEnv)
    expect(config.dataDir).toBe('/data')
  })
})

describe('outbound MCP servers', () => {
  it('reads the two transports, and keeps what each one needs', () => {
    const config = parseConfig(`
mcp:
  servers:
    - name: home-assistant
      url: https://ha.example/mcp
      headers:
        Authorization: Bearer abc
    - name: cutlist
      command: node
      args: ['./bin/cutlist.js']
      env:
        LANG: fr
`)
    expect(config.mcpServers).toEqual([
      {
        name: 'home-assistant',
        url: 'https://ha.example/mcp',
        headers: { Authorization: 'Bearer abc' },
      },
      { name: 'cutlist', command: 'node', args: ['./bin/cutlist.js'], env: { LANG: 'fr' } },
    ])
  })

  it('was accepted and IGNORED before this existed', () => {
    // The bug this section exists to close: unknown keys were refused at the
    // top level only, so `mcp.servers` — the shape the design documents —
    // booted clean and the agent never saw a single server.
    expect(issuesOf('mcp:\n  serveurs: []\n')).toEqual([
      'mcp.serveurs is not a setting — known keys: servers, enabled, token, agentName, maxPending, ttlMs',
    ])
  })

  it('refuses a server with no transport, and one with both', () => {
    expect(issuesOf('mcp:\n  servers:\n    - name: ghost\n')).toEqual([
      'mcp.servers[0]: needs either "command" (stdio) or "url" (http)',
    ])
    expect(
      issuesOf('mcp:\n  servers:\n    - name: two\n      command: node\n      url: https://x/mcp\n'),
    ).toEqual(['mcp.servers[0]: has both "command" and "url" — pick one transport'])
  })

  it('refuses two servers under one name', () => {
    // Otherwise the config's meaning depends on the order of a list.
    expect(
      issuesOf('mcp:\n  servers:\n    - name: ha\n      url: https://a/mcp\n    - name: ha\n      url: https://b/mcp\n'),
    ).toEqual(['mcp.servers[1]: "ha" is declared twice'])
  })

  it('refuses a name that is not one', () => {
    expect(issuesOf('mcp:\n  servers:\n    - url: https://x/mcp\n')).toEqual([
      'mcp.servers[0].name is required (letters, digits, dashes and underscores)',
    ])
  })

  it('refuses a placeholder the environment never filled', () => {
    // A literal "${TOKEN}" reaching a server fails later, in a call, blaming
    // the server rather than the config that never resolved.
    expect(
      issuesOf('mcp:\n  servers:\n    - name: ha\n      url: https://x/mcp\n      headers:\n        Authorization: "${HA_TOKEN}"\n'),
    ).toEqual(['mcp.servers[0].headers.Authorization is still "${HA_TOKEN}" — that variable is not set'])
  })

  it('leaves the inbound side alone', () => {
    // Two directions in one block: declaring servers must not switch on the
    // endpoint other agents call.
    const config = parseConfig('mcp:\n  servers:\n    - name: ha\n      url: https://x/mcp\n')
    expect(config.mcp.enabled).toBe(false)
    expect(config.mcpServers).toHaveLength(1)
  })
})

describe('an MCP server that authenticates itself', () => {
  it('reads the identity a hub needs', () => {
    const config = parseConfig(`
mcp:
  servers:
    - name: maps
      url: https://hub.example/maps
      auth:
        tokenUrl: https://auth.example/api/oidc/token
        clientId: agent-golem
        clientSecret: s3cret
        scope: mcp
        audience: https://hub.example
`)
    expect(config.mcpServers[0]?.auth).toEqual({
      tokenUrl: 'https://auth.example/api/oidc/token',
      clientId: 'agent-golem',
      clientSecret: 's3cret',
      scope: 'mcp',
      audience: 'https://hub.example',
    })
  })

  it('refuses an identity with a piece missing', () => {
    expect(
      issuesOf('mcp:\n  servers:\n    - name: m\n      url: https://h/m\n      auth:\n        clientId: x\n'),
    ).toEqual(['mcp.servers[0].auth.tokenUrl is required'])
  })

  it('refuses a placeholder the environment never filled', () => {
    // `invalid_client` at a token endpoint reads as a wrong secret, not as a
    // variable nobody set — so it is caught here instead.
    expect(
      issuesOf(
        'mcp:\n  servers:\n    - name: m\n      url: https://h/m\n      auth:\n        tokenUrl: https://a/t\n        clientId: x\n        clientSecret: "${GOLEM_HUB_SECRET}"\n',
      ),
    ).toEqual(['mcp.servers[0].auth.clientSecret is still "${GOLEM_HUB_SECRET}" — that variable is not set'])
  })

  it('refuses credentials on a server that has nobody to present them to', () => {
    expect(
      issuesOf(
        'mcp:\n  servers:\n    - name: m\n      command: node\n      auth:\n        tokenUrl: https://a/t\n        clientId: x\n        clientSecret: y\n',
      ),
    ).toEqual(['mcp.servers[0].auth needs "url" — a stdio server has nobody to authenticate to'])
  })

  it('accepts a public client acting for a person with a refresh token', () => {
    const config = parseConfig(`
mcp:
  servers:
    - name: research
      url: https://gw.example/mcp
      identity: user
      auth:
        tokenUrl: https://gw.example/token
        clientId: public-client
        refreshToken: rt-armed
        scope: openid
`)
    expect(config.mcpServers[0]?.auth).toEqual({
      tokenUrl: 'https://gw.example/token',
      clientId: 'public-client',
      refreshToken: 'rt-armed',
      scope: 'openid',
    })
  })

  it('refuses an identity with neither a secret nor a refresh token', () => {
    expect(
      issuesOf(
        'mcp:\n  servers:\n    - name: m\n      url: https://h/m\n      auth:\n        tokenUrl: https://a/t\n        clientId: x\n',
      ),
    ).toEqual([
      'mcp.servers[0].auth needs either "clientSecret" (client_credentials) or "refreshToken" (a token from an interactive login)',
    ])
  })
})

describe('the instance name', () => {
  it('is absent unless the operator writes one', () => {
    expect(parseConfig('').name).toBeUndefined()
  })

  it('is taken as written, trimmed', () => {
    expect(parseConfig('name: "  Atelier  "').name).toBe('Atelier')
  })

  it('refuses a blank one rather than installing an unnamed icon', () => {
    // "" is not "no name": it is a manifest whose name is empty, which some
    // launchers show as an unnamed icon instead of falling back.
    expect(() => parseConfig('name: "   "')).toThrow(/must not be blank/)
  })

  it('refuses what cannot be a name', () => {
    expect(() => parseConfig('name: 12')).toThrow(/name must be a string/)
    expect(() => parseConfig(`name: "${'x'.repeat(61)}"`)).toThrow(/61 characters/)
  })

  it('has no environment override, unlike where the instance runs', () => {
    // The environment says WHERE an instance runs; the file says what it IS.
    expect(parseConfig('', { GOLEM_NAME: 'Atelier' }).name).toBeUndefined()
  })
})

describe('workspace.watch', () => {
  it('is on by default: both hands write, so the shell must see the other one', () => {
    expect(parseConfig('').workspace.watch).toEqual({
      enabled: true,
      polling: false,
      intervalMs: 2000,
    })
  })

  it('takes the operator settings', () => {
    const config = parseConfig(
      'workspace:\n  watch:\n    enabled: false\n    polling: true\n    intervalMs: 500\n',
    )
    expect(config.workspace.watch).toEqual({ enabled: false, polling: true, intervalMs: 500 })
  })

  it('refuses what cannot mean anything', () => {
    expect(() => parseConfig('workspace:\n  watch:\n    enabled: "yes"\n')).toThrow(
      /watch.enabled must be true or false/,
    )
    // Below 100ms, polling a big tree is a CPU spin dressed as a setting.
    expect(() => parseConfig('workspace:\n  watch:\n    intervalMs: 10\n')).toThrow(
      /intervalMs must be an integer >= 100/,
    )
  })

  it('refuses a typo rather than ignoring the setting it hides', () => {
    expect(() => parseConfig('workspace:\n  watch:\n    poling: true\n')).toThrow(
      /workspace.watch.poling is not a setting/,
    )
  })
})
