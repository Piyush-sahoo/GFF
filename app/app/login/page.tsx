import { redirect } from "next/navigation";

// Sign-in lives on the profile page; /login is a convenience alias so a guessed
// URL lands somewhere useful instead of 404-ing.
export default function Login() {
  redirect("/profile");
}
