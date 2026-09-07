import { redirect } from "next/navigation";

export default function Home() {
  // Náhled appky je veřejný — půdorys je i bez přihlášení, ne jen po přihlášení.
  redirect("/dashboard");
}
