import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — SupportFlow AI" },
      { name: "description", content: "Monitor support tickets, escalations and AI resolution rates." },
      { property: "og:title", content: "Admin Dashboard — SupportFlow AI" },
      { property: "og:description", content: "Ticket analytics and AI support performance at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDashboard,
});
