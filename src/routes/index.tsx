import { createFileRoute } from "@tanstack/react-router";
import { SupportChat } from "@/components/support/SupportChat";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Customer Support — SupportFlow AI" },
      { name: "description", content: "Chat with the SupportFlow AI assistant and get instant answers to your questions." },
      { property: "og:title", content: "Customer Support — SupportFlow AI" },
      { property: "og:description", content: "Instant, friendly AI support with human follow-up when you need it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportChat,
});
