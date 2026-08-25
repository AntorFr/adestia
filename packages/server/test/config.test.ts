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
