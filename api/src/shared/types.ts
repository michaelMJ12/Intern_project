export interface Home {
  id: string;
  name: string;
  created_at: string;
}

export interface Member {
  id: string;
  home_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Bill {
  id: string;
  home_id: string;
  title: string;
  total_cents: number;
  created_at: string;
}

export interface BillShare {
  id: string;
  bill_id: string;
  member_id: string;
  amount_cents: number;
  paid_at: string | null;
  idempotency_key?: string | null;
}

export interface BillShareResponse {
  id: string;
  memberId: string;
  amountCents: number;
  paidAt: string | null;
}

export interface BillResponse {
  id: string;
  homeId: string;
  title: string;
  totalCents: number;
  shares: BillShareResponse[];
}

export interface Balance {
  memberId: string;
  name: string;
  outstandingCents: number;
}

export interface PaymentResponse {
  id: string;
  memberId: string;
  amountCents: number;
  paidAt: string;
}
