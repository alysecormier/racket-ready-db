import { createFileRoute } from "@tanstack/react-router";
import { expireOffersAndRoll } from "@/lib/waitlist.server";
import { requireCronSecret } from "@/lib/webhook-auth.server";

export const Route = createFileRoute("/api/public/hooks/expire-offers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = requireCronSecret(request);
        if (unauthorized) return unauthorized;
        const result = await expireOffersAndRoll();
        return Response.json(result);
      },
    },
  },
});
