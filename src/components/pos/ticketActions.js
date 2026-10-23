import { useCallback } from "react";
import { usePos } from "../../lib/pos/store";
import { useDialog } from "./Dialog";

// Ticket actions shared by the toolbar, the ticket panel and the payment screen.
export function useTicketActions() {
  const { comment, setComment, lines, voidOrder, showToast } = usePos();
  const dialog = useDialog();

  // Note on the current ticket; saved with the sale and printed on the receipt.
  const editComment = useCallback(async () => {
    const text = await dialog.prompt({
      title: "Comment on this sale",
      message: "Printed on the receipt. Leave empty to remove it.",
      defaultValue: comment || "",
      placeholder: "e.g. Deliver to shop, bill for ABC Traders",
      multiline: true,
      confirmLabel: "Save comment",
    });
    if (text === null) return;
    setComment(text.trim());
    showToast(text.trim() ? "Comment added to this sale" : "Comment removed", "info");
  }, [dialog, comment, setComment, showToast]);

  // Asks first, then for an optional reason; the reason is stored with the voided order.
  const voidWithReason = useCallback(async () => {
    if (!lines.length) return false;
    const ok = await dialog.confirm({
      title: "Void this order?",
      message: "The ticket is discarded. This cannot be undone.",
      confirmLabel: "Void order",
      danger: true,
    });
    if (!ok) return false;
    const reason = await dialog.prompt({ title: "Reason for voiding", placeholder: "optional (e.g. customer left)" });
    voidOrder(reason === null ? "" : reason.trim());
    return true;
  }, [dialog, lines, voidOrder]);

  return { editComment, voidWithReason };
}
