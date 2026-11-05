interface PaymentButtonProps {
  paid: boolean;
  loading: boolean;
  onPay: () => void;
}

export function PaymentButton({
  paid,
  loading,
  onPay,
}: PaymentButtonProps) {
  if (paid) {
    return (
      <span className="payment-status paid">
        <span aria-hidden="true">✓</span> Paid
      </span>
    );
  }

  return (
    <button
      type="button"
      className="pay-button"
      onClick={onPay}
      disabled={loading}
    >
      {loading ? "Processing..." : "Pay share"}
    </button>
  );
}
