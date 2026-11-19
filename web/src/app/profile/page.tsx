import { redirect } from "next/navigation";

/**
 * The sound profile is no longer a destination of its own.
 *
 * It arrives beside the matches it explains, on `/match`, because a profile
 * read on its own cannot tell you anything you can act on. Kept as a redirect
 * so older links and bookmarks still land somewhere correct.
 */
export default function ProfilePage() {
  redirect("/match");
}
