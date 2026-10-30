/**
 * The servers this instance can call, as a screen you can act on.
 *
 * What it replaces was a read-only list of names and states, stacked under
 * the credential panel. It answered "is anything broken" and nothing else:
 * you could see that a server needed a sign-in, and there was no way from
 * there to see what that server even was, let alone add one. Wiring an MCP
 * server meant a text editor, a config file and a restart — which is fine for
 * the operator who deployed the instance and impossible for anybody else.
 *
 * So: a tile per server, dressed like every other tile in this product, and
 * the tile opens the DECLARATION. Three things follow from that, and each is
 * a rule rather than a detail.
 *
 * **A server says where it came from.** Config, plugin or added here — and
 * only the last is editable. A screen that let you type into a plugin's
 * server would be a screen offering an edit that the next start throws away,
 * which is the same mistake the instruction zone made and fixed.
 *
 * **Secrets come back masked, and go out masked.** The bullets in `env`, in
 * `headers` and in `auth` are not decoration: the server never sends the real
 * value, and a value posted back still equal to the mask means "keep the one
 * you are holding". So somebody can fix a typo in a URL without being asked
 * to re-type a token they may not have any more.
 *
 * **The config is edited as config.** A form with a field per option would
 * have to know every option, and would quietly drop the one it did not know
 * about — `auth`, say, which is the whole reason a hub works. The declaration
 * is a small JSON object; the screen shows it, and the server judges what
 * comes back with the very same grammar the YAML file goes through.
 */

import { ServerDetail } from './mcp/ServerDetail.js'
import { ServerList } from './mcp/ServerList.js'
import { useDeclaration } from './mcp/useDeclaration.js'
import { useMcpServers } from './Settings.js'
import { useConnections } from './signin.js'

export interface McpServersProps {
  /** The server whose declaration is open, from the address. */
  readonly open?: string | undefined
  readonly onOpen: (name: string | undefined) => void
  readonly fetchImpl?: typeof fetch
  readonly t?: (key: string) => string
}

export function McpServers({ open, onOpen, fetchImpl = fetch, t = (key) => key }: McpServersProps) {
  const health = useMcpServers(fetchImpl)
  const connections = useConnections(fetchImpl)
  const declaration = useDeclaration(open, onOpen, fetchImpl, t)
  const { views, shown, adding } = declaration

  if (adding || shown) {
    return (
      <ServerDetail
        shown={shown}
        adding={adding}
        state={health?.find((entry) => entry.name === shown?.name)}
        connection={connections?.find((entry) => entry.name === shown?.name)}
        draft={declaration.draft}
        dirty={declaration.dirty}
        save={declaration.save}
        onDraft={declaration.setDraft}
        onSave={() => void declaration.commit()}
        onRemove={() => declaration.remove()}
        t={t}
      />
    )
  }
  return <ServerList views={views} health={health} onOpen={onOpen} onAdd={declaration.beginAdding} t={t} />
}
