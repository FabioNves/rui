import { Suspense } from "react";
import { CallbackClient } from "./CallbackClient";

export const dynamic = "force-dynamic";

export default function CallbackPage() {
  return (
    <Suspense>
      <CallbackClient />
    </Suspense>
  );
}
