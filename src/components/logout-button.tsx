"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { getJson } from "@/lib/client-api";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await getJson("/api/logout", { method: "POST" });
          router.refresh();
          router.push("/login");
        })
      }
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
