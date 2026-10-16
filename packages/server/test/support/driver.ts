/**
 * The fake `Driver` every server test shares.
 *
 * Written once: ten files used to declare their own, each a little different,
 * and a new test copied whichever it opened first. A test that needs a
 * behaviour this module lacks gives the module an option — it does not
 * declare a driver of its own.
 */

import type {
  Driver,
  DriverDescriptor,
  InstructionZone,
  TurnEvent,
  TurnRequest,
} from '@antorfr/adestia-drivers'

export const RESULT: TurnEvent = { type: 'result', sessionId: 's1', stopped: false }

export interface ScriptedDriverOptions {
  readonly capabilities?: DriverDescriptor['capabilities']
  /** Holds every turn until it resolves, or until the turn is told to stop. */
  readonly hold?: Promise<void>
  readonly instructionPaths?: readonly (string | InstructionZone)[]
  /** A CLI that ships skills: the desk and the boot introduce the shell to it. */
  readonly skillsPath?: string
  /** A CLI with an agent zone: the boot delivers subagents there. */
  readonly agentsPath?: string
}

/** A driver reduced to a script, so the server is tested without any CLI. */
export class ScriptedDriver implements Driver {
  /** The prompts of the turns that were stopped mid-flight. */
  stopped: string[] = []
  requests: TurnRequest[] = []

  /**
   * Resolves when the driver has actually been pulled for a turn.
   *
   * What the tests need is the CHAIN to be registered at the desk — it is what
   * makes a second post queue rather than race, and what makes a second turn
   * hit the cap. The desk registers it before it pulls the driver, so a driver
   * saying "I have been asked" cannot say it too early.
   *
   * They used to wait a fixed number of event-loop turns instead, which is a
   * race dressed as a delay: green on an idle machine, lost on a loaded CI
   * runner, and failing on an assertion that names something else entirely.
   */
  readonly running: Promise<void>
  #pulled: () => void = () => {}

  constructor(
    private readonly script: readonly TurnEvent[] = [],
    private readonly options: ScriptedDriverOptions = {},
  ) {
    this.running = new Promise((resolve) => {
      this.#pulled = resolve
    })
    const paths = options.instructionPaths
    if (paths) this.instructionPaths = () => paths
    const { skillsPath, agentsPath } = options
    if (skillsPath !== undefined) this.skillsPath = () => skillsPath
    if (agentsPath !== undefined) this.agentsPath = () => agentsPath
  }

  instructionPaths?: () => readonly (string | InstructionZone)[]
  skillsPath?: () => string
  agentsPath?: () => string

  describe(): Promise<DriverDescriptor> {
    return Promise.resolve({
      id: 'scripted',
      label: 'Scripted CLI',
      cliVersion: '1.2.3',
      capabilities: this.options.capabilities ?? ['usageMetrics'],
    })
  }

  env(): Promise<Readonly<Record<string, string>>> {
    return Promise.resolve({})
  }

  listModels(): Promise<readonly { id: string }[]> {
    return Promise.resolve([{ id: 'model-a' }])
  }

  /**
   * Stops the way a real driver does: on the request's own signal, not on a
   * method somebody looks up by session id.
   */
  async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
    this.requests.push(request)
    this.#pulled()
    if (this.options.hold) await Promise.race([this.options.hold, aborted(request.signal)])
    if (request.signal?.aborted) {
      this.stopped.push(request.prompt)
      yield { type: 'result', sessionId: 's1', stopped: true }
      return
    }
    for (const event of this.script) yield event
  }
}

/** Resolves when the turn is told to stop — never, when nothing can tell it. */
function aborted(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return new Promise<void>(() => {})
  if (signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
}

/**
 * A `Driver` from a partial one: what the test does not say is the quietest
 * thing a driver can be — no capabilities, no models, a turn that ends at once.
 */
export function driverWith(overrides: Partial<Driver> = {}): Driver {
  return {
    describe: () => Promise.resolve({ id: 'test', label: 'Test', cliVersion: '0', capabilities: [] }),
    env: () => Promise.resolve({}),
    runTurn: async function* () {},
    ...overrides,
  }
}

/**
 * A driver whose turns the test scripts, one `requests` entry per call.
 * `script` receives the request and its 1-based call number.
 */
export function scriptedDriver(script: (request: TurnRequest, call: number) => TurnEvent[]) {
  const requests: TurnRequest[] = []
  return {
    ...driverWith({
      async *runTurn(request: TurnRequest): AsyncIterable<TurnEvent> {
        requests.push(request)
        yield* script(request, requests.length)
      },
    }),
    requests,
  }
}

export const ARM_TOKEN = 'sk-ant-oat01-supersecretvaluenobodyshouldsee'

/**
 * A scripted driver that can be armed, standing in for the real terminal flow.
 * `outcome: 'refuse'` makes the upstream reject the code; `credentialVar` is
 * the variable the secret would be stored in.
 */
export function armableDriver(options: { outcome?: 'ok' | 'refuse'; credentialVar?: string } = {}) {
  const outcome = options.outcome ?? 'ok'
  const driver = new ScriptedDriver([RESULT], { capabilities: ['usageMetrics', 'authManagement'] })
  // The test reads these back off the driver, so they live on it.
  const state = Object.assign(driver, {
    credentialVar: options.credentialVar ?? 'SCRIPTED_TOKEN',
    credentials: {} as Record<string, string>,
    savedAt: undefined as string | undefined,
    cancelled: 0,
  })
  return Object.assign(state, {
    authStatus: () =>
      Promise.resolve(
        Object.keys(state.credentials).length > 0
          ? { state: 'armed', source: 'managed', savedAt: state.savedAt }
          : { state: 'absent', source: 'cli-native' },
      ),
    beginAuth: () =>
      Promise.resolve({
        sessionId: 'driver-side-id',
        mode: 'url+code',
        authorizeUrl: 'https://claude.ai/oauth/authorize?x=1',
        ttl: 600,
      }),
    completeAuth: (_id: string, input: string) =>
      outcome === 'refuse'
        ? Promise.reject(new Error('code rejected upstream'))
        : Promise.resolve({ secret: `${ARM_TOKEN}-${input}` }),
    cancelAuth: () => {
      state.cancelled += 1
      return Promise.resolve()
    },
    setCredentials: (credentials: Record<string, string>, savedAt?: string) => {
      state.credentials = credentials
      state.savedAt = savedAt
    },
  })
}
