import type { Share } from "../types";
import { PaymentButton } from "./PaymentButton";

interface ShareListProps {
  shares: Share[];
  billId: string;
  payingShareId: string | null;
  onPay: (billId: string, shareId: string) => void;
}

function formatCents(amount: number): string {
  return `$${(amount / 100).toFixed(2)}`;
}

export function ShareList({
  shares,
  billId,
  payingShareId,
  onPay,
}: ShareListProps) {
  if (shares.length === 0) {
    return <p>No shares available.</p>;
  }

  return (
    <div className="share-list">
      {shares.map((share) => (
        <div className="share-item" key={share.id}>
          <div>
            <strong>
              Member {share.memberId.slice(0, 8)}
            </strong>

            <p>{formatCents(share.amountCents)}</p>
          </div>

          <PaymentButton
            paid={share.paidAt !== null}
            loading={payingShareId === share.id}
            onPay={() => onPay(billId, share.id)}
          />
        </div>
      ))}
    </div>
  );
}
