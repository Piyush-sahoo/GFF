import { redirect } from "next/navigation";

/**
 * /agent -> /ask.
 *
 * The surface is called "AI Agent" in the UI now, so /agent is the URL people
 * will guess and type. The canonical route stays /ask because it is already
 * deployed and linked to from elsewhere in the app; renaming it mid-event would
 * break those links for no user-visible gain.
 *
 * Permanent because the mapping is not going to change back.
 */
export default function AgentAliasPage() {
  redirect("/ask");
}
