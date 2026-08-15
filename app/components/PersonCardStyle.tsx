/**
 * Styles for the person cards on /people and /meet.
 *
 * These live here rather than in globals.css deliberately: globals.css is a
 * shared file with another worker's changes in flight, and appending to it
 * would drag their work into an unrelated commit. Every selector below is
 * prefixed .pname / .spcard-btn so nothing here can reach another surface.
 *
 * The bug this fixes: .spcard sets no colour. As a <button> it therefore fell
 * back to the user-agent button colour — near-black on our dark ground — so
 * the name was unreadable while .sprole underneath, which sets teal
 * explicitly, looked fine. That mismatch is what made it look like only the
 * name was broken.
 */
export default function PersonCardStyle() {
  return (
    <style>{`
      /* A card that is a button must be told its colour; it does not inherit. */
      .spcard-btn { color: var(--text); font-family: inherit; text-align: left; }

      /* Name and badge share a line but the name wraps first, so a long name
         pushes the badge down instead of colliding with it. */
      .pname {
        display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
        margin: 0; font-family: var(--serif); font-weight: 400;
        font-size: 17px; line-height: 1.25; color: var(--text);
      }
      .pname-link { color: var(--text); text-decoration: none; }
      .pname-link:hover { color: var(--saffron); }

      .pname-badge {
        flex: none;
        font-family: var(--mono); font-size: 9px; letter-spacing: 0.06em;
        text-transform: uppercase; padding: 2px 6px; border-radius: 4px;
        border: 1px solid var(--saffron-dim); color: var(--saffron);
      }
    `}</style>
  );
}
