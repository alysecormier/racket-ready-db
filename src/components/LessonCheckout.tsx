import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createLessonBookingCheckout } from "@/lib/booking.functions";

interface LessonCheckoutProps {
  lessonId: string;
  studentId?: string | null;
  returnUrl?: string;
}

export function LessonCheckout({ lessonId, studentId, returnUrl }: LessonCheckoutProps) {
  const fetchClientSecret = async (): Promise<string> => {
    const secret = await createLessonBookingCheckout({
      data: {
        lessonId,
        studentId: studentId ?? null,
        returnUrl: returnUrl || `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        environment: getStripeEnvironment(),
      },
    });
    if (!secret) throw new Error("Failed to start checkout session");
    return secret;
  };

  return (
    <div id="checkout" className="min-h-[600px]">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
