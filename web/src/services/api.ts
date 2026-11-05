import type {
  BillsResponse,
  PaymentResponse,
} from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}${endpoint}`,
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      },
    );
  } catch {
    throw new Error(
      "Unable to connect to the server. Please try again.",
    );
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `The server returned an invalid response (${response.status}).`,
    );
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}

export const api = {
  getBills(homeId: string): Promise<BillsResponse> {
    return request<BillsResponse>(
      `/api/homes/${encodeURIComponent(homeId)}/bills`,
    );
  },

  payShare(
    billId: string,
    shareId: string,
    idempotencyKey: string,
  ): Promise<PaymentResponse> {
    return request<PaymentResponse>(
      `/api/bills/${encodeURIComponent(billId)}/shares/${encodeURIComponent(shareId)}/pay`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      },
    );
  },
};
