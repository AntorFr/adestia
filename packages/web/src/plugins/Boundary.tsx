/**
 * Keeps a plugin's render failure to itself.
 *
 * React unmounts the whole tree on an uncaught render error, so without this a
 * plugin with a typo takes down the chat beside it. The boundary is the render
 * equivalent of the try/catch the loader already puts around a factory.
 *
 * It lives here rather than in the shell because there are now two places a
 * plugin gets to render: its own screen, and a block INSIDE somebody's page.
 * The second is the one that made this worth moving — a broken block would
 * otherwise blank the whole document around it, losing the text a person
 * wrote to a fault in code they never asked for.
 */

import { Component, type ReactNode } from 'react'

export class PluginBoundary extends Component<
  {
    id: string
    /** What stopped, in the reader's terms: an app's screen, or one block. */
    what?: string
    children: ReactNode
  },
  { error?: Error }
> {
  override state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (this.state.error) {
      return (
        <section className="adestia-problems" role="status">
          <h2>
            The “{this.props.id}” {this.props.what ?? 'app'} stopped
          </h2>
          <p>{this.state.error.message}</p>
        </section>
      )
    }
    return this.props.children
  }
}
