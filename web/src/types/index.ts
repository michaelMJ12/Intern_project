export interface Share {
  id: string;
  memberId: string;
  amountCents: number;
  paidAt: string | null;
}

export interface Bill {
  id: string;
  homeId: string;
  title: string;
  totalCents: number;
  shares: Share[];
}

export interface BillsResponse {
  bills: Bill[];
}

export interface PaymentResponse {
  id: string;
  memberId: string;
  amountCents: number;
  paidAt: string;
}

export interface ApiError {
  error: string;
}
