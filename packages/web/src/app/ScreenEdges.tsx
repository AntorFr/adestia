/**
 * The two edge handles of the folded shell, drawn outside the swipe track.
 */

export function ScreenEdges({
  screen,
  onScreen,
  t,
}: {
  readonly screen: 'chat' | 'canvas'
  readonly onScreen: (screen: 'chat' | 'canvas') => void
  readonly t: (key: string) => string
}) {
  /* The gesture, given something to look at — and kept OUT of the track.

          A transformed element is the containing block for its `fixed`
          descendants, so a handle left inside the shell would ride the drag
          and leave the screen with it. Out here it stays against the glass,
          which is also what a handle is for.

          A swipe nobody suspects is a swipe nobody makes. Folded, the two
          panes stack perfectly: nothing on screen says a second one is
          waiting, and the header buttons are the only admission that it
          exists. These handles are the seam — the sliver of the pane you
          cannot see, poking in from the side it sits on.

          Their destinations are CONSTANT, and that is load-bearing rather
          than tidy. A swipe that starts on a handle may be followed by the
          click the browser synthesises for the same finger; a toggle would
          then undo the swipe it had just made, and the screen would sit
          exactly where it started. Two handles that each name one screen
          make that second event a no-op instead of a bug. */
  return (
    <div className="adestia-edges" data-screen={screen}>
      <button
        type="button"
        className="adestia-edge"
        data-side="right"
        onClick={() => onScreen('canvas')}
        aria-label={t('Open apps')}
      />
      <button
        type="button"
        className="adestia-edge"
        data-side="left"
        onClick={() => onScreen('chat')}
        aria-label={t('Back to the chat')}
      />
    </div>
  )
}
