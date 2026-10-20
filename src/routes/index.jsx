import { createFileRoute } from "@tanstack/react-router";
import PosApp from "../components/pos/PosApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jnex POS system — Offline Desktop Point of Sale" },
      {
        name: "description",
        content:
          "Jnex POS: role-based passcode login, product and bill discounts, cart and payments, bill history with refunds, inventory, debt tracking and daily/weekly/monthly sales reports.",
      },
      { property: "og:title", content: "Jnex POS system — Offline Desktop Point of Sale" },
      {
        property: "og:description",
        content:
          "Fast touch-first POS terminal with owner and cashier roles, discounts, printable receipts, bill history and sales reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PosApp,
});
