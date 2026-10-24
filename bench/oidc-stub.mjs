/**
 * A local identity provider, so the gates of E-1 are real: sign-in goes through
 * the product's own `/auth/login` → provider → `/auth/callback`, and nothing in
 * the product is bypassed.
 *
 * The product speaks to an issuer over HTTPS only (openid-client refuses
 * plain http), so the stub serves a self-signed certificate made by `openssl`
 * and sets `NODE_TLS_REJECT_UNAUTHORIZED=0` for this process and its children.
 * The launcher refuses this seed with the real Claude engine before loading it.
 * A browser that follows the redirect to the stub must ignore certificate
 * errors.
 *
 * Who signs in is the stub's current user: `GET /__as?user=<name>` changes it
 * (default `alice`). Two users: `alice`, in the group `famille` (allowed), and
 * `visiteur`, in `invites` (the seed's `allowedGroups` refuses it at sign-in).
 */
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const USERS = {
  alice: { sub: 'bench-alice', name: 'Alice', groups: ['famille'] },
  visiteur: { sub: 'bench-visiteur', name: 'Visiteur', groups: ['invites'] },
}
export const CLIENT_ID = 'bench-client'
export const CLIENT_SECRET = 'bench-client-secret'

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

export async function startOidcStub() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const dir = await mkdtemp(join(tmpdir(), 'adestia-oidc-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'bench-key', use: 'sig', alg: 'RS256' }

  let current = 'alice'
  const codes = new Map()
  let issuer = ''

  const sign = (claims) => {
    const head = b64({ alg: 'RS256', typ: 'JWT', kid: 'bench-key' })
    const body = b64(claims)
    const signature = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url')
    return `${head}.${body}.${signature}`
  }
  const claimsOf = (user) => ({ sub: user.sub, name: user.name, preferred_username: user.name.toLowerCase(), groups: user.groups })
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const form = async (req) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    return new URLSearchParams(raw)
  }

  const server = createServer(
    { key: await readFile(join(dir, 'key.pem')), cert: await readFile(join(dir, 'cert.pem')) },
    async (req, res) => {
      const url = new URL(req.url, issuer)
      if (url.pathname === '/.well-known/openid-configuration') {
        return json(res, 200, {
          issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks.json`, userinfo_endpoint: `${issuer}/userinfo`,
          response_types_supported: ['code'], subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic'],
          code_challenge_methods_supported: ['S256'], scopes_supported: ['openid', 'profile', 'email', 'groups'],
        })
      }
      if (url.pathname === '/jwks.json') return json(res, 200, { keys: [jwk] })
      if (url.pathname === '/__as') {
        const name = url.searchParams.get('user') ?? ''
        if (!USERS[name]) return json(res, 400, { error: `no such user; one of ${Object.keys(USERS).join(', ')}` })
        current = name
        return json(res, 200, { user: name })
      }
      if (url.pathname === '/authorize') {
        const redirect = url.searchParams.get('redirect_uri')
        if (!redirect) return json(res, 400, { error: 'redirect_uri is required' })
        const code = randomUUID()
        codes.set(code, USERS[current])
        const back = new URL(redirect)
        back.searchParams.set('code', code)
        back.searchParams.set('state', url.searchParams.get('state') ?? '')
        res.writeHead(302, { location: back.href })
        return res.end()
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const user = codes.get((await form(req)).get('code') ?? '')
        if (!user) return json(res, 400, { error: 'invalid_grant' })
        const now = Math.floor(Date.now() / 1000)
        return json(res, 200, {
          access_token: `access-${user.sub}`, token_type: 'Bearer', expires_in: 3600,
          id_token: sign({ iss: issuer, aud: CLIENT_ID, iat: now, exp: now + 3600, ...claimsOf(user) }),
        })
      }
      if (url.pathname === '/userinfo') {
        const user = Object.values(USERS).find((candidate) => `Bearer access-${candidate.sub}` === req.headers.authorization)
        return user ? json(res, 200, claimsOf(user)) : json(res, 401, { error: 'invalid_token' })
      }
      return json(res, 404, { error: 'not found' })
    },
  )
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  issuer = `https://127.0.0.1:${server.address().port}`
  return {
    issuer,
    close: async () => {
      server.closeAllConnections?.()
      await new Promise((done) => server.close(done))
      await rm(dir, { recursive: true, force: true })
    },
  }
}
