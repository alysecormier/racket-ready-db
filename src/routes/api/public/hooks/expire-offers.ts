import { createFileRoute } from "@tanstack/react-router";
import { expireOffersAndRoll } from "@/lib/waitlist.server";

export const Route = createFileRoute("/api/public/hooks/expire-offers")({
  server: {
    handlers: {
      POST: async () => {
        const result = await expireOffersAndRoll();
        return Response.json(result);
      },
    },
  },
});
