/**
 * What the shell shows instead of itself: refused, asked to sign in, unable
 * to start, or still loading.
 */

export function RefusedGate({ t }: { readonly t: (key: string) => string }) {
  return (
    <main className="adestia-fatal" role="alert">
      <h1>{t('Not allowed')}</h1>
      <p>
        You are signed in, but your account is not in a group this instance admits. Ask whoever
        runs it to add you.
      </p>
      <form method="post" action="/auth/logout">
        <button type="submit" className="adestia-switch">
          Sign out
        </button>
      </form>
    </main>
  )
}

export function SignInGate() {
  return (
    <main className="adestia-signin">
      <h1>Adestia</h1>
      <p>This instance requires you to sign in.</p>
      <a className="adestia-signin__button" href={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.hash)}`}>
        Sign in
      </a>
    </main>
  )
}

export function FatalGate({ t, message }: { readonly t: (key: string) => string; readonly message: string }) {
  return (
    <main className="adestia-fatal" role="alert">
      <h1>{t('Adestia could not start')}</h1>
      <p>{message}</p>
    </main>
  )
}

export function LoadingGate() {
  return <main className="adestia-loading">Loading…</main>
}
