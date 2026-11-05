import type { Bill } from "../types";
import { ShareList } from "./ShareList";

interface BillCardProps {
  bill: Bill;
  payingShareId: string | null;
  onPay: (billId: string, shareId: string) => void;
}

function formatCents(amount: number): string {
  return `$${(amount / 100).toFixed(2)}`;
}

export function BillCard({
  bill,
  payingShareId,
  onPay,
}: BillCardProps) {
  const paidAmount = bill.shares
    .filter((share) => share.paidAt !== null)
    .reduce(
      (total, share) => total + share.amountCents,
      0,
    );

  return (
    <article className="bill-card">
      <div className="bill-header">
        <div>
          <h3>{bill.title}</h3>
          <p>Bill ID: {bill.id.slice(0, 8)}</p>
        </div>

        <strong>{formatCents(bill.totalCents)}</strong>
      </div>

      <div className="bill-progress">
        <span>
          Paid: {formatCents(paidAmount)}
        </span>

        <span>
          Outstanding: {formatCents(
            bill.totalCents - paidAmount,
          )}
        </span>
      </div>

      <h4>Member shares</h4>

      <ShareList
        shares={bill.shares}
        billId={bill.id}
        payingShareId={payingShareId}
        onPay={onPay}
      />
    </article>
  );
}
