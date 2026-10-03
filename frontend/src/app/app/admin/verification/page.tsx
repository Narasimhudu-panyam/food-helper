import { redirect } from "next/navigation";

export default function AdminVerificationRedirect() {
  redirect("/app/admin/verifications");
}
