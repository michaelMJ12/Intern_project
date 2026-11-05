import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { Bill } from "../types";

export function useBills(homeId: string) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payingShareId, setPayingShareId] =
    useState<string | null>(null);

  const idempotencyKeys = useRef(
    new Map<string, string>(),
  );

  const loadBills = useCallback(async () => {
    if (!homeId.trim()) {
      setBills([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.getBills(homeId);

      setBills(response.bills);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load bills",
      );
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    let active = true;

    if (!homeId.trim()) {
      setBills([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    async function fetchBills() {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL ?? "http://localhost:8787"}/api/homes/${encodeURIComponent(homeId)}/bills`,
          {
            signal: controller.signal,
          },
        );

        const data: unknown = await response.json();

        if (!response.ok) {
          const message =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
              ? data.error
              : "Unable to load bills";

          throw new Error(message);
        }

        if (
          typeof data !== "object" ||
          data === null ||
          !("bills" in data) ||
          !Array.isArray(data.bills)
        ) {
          throw new Error("Invalid bills response");
        }

        if (active) {
          setBills(data.bills as Bill[]);
        }
      } catch (err) {
        if (
          active &&
          !(err instanceof DOMException && err.name === "AbortError")
        ) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load bills",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void fetchBills();

    return () => {
      active = false;
      controller.abort();
    };
  }, [homeId]);

  const payShare = useCallback(
    async (billId: string, shareId: string) => {
      const key = `${billId}:${shareId}`;

      let idempotencyKey = idempotencyKeys.current.get(key);

      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        idempotencyKeys.current.set(key, idempotencyKey);
      }

      setPayingShareId(shareId);

      try {
        const payment = await api.payShare(
          billId,
          shareId,
          idempotencyKey,
        );

        setBills((currentBills) =>
          currentBills.map((bill) =>
            bill.id !== billId
              ? bill
              : {
                  ...bill,
                  shares: bill.shares.map((share) =>
                    share.id === shareId
                      ? {
                          ...share,
                          paidAt: payment.paidAt,
                        }
                      : share,
                  ),
                },
          ),
        );

        idempotencyKeys.current.delete(key);

        return true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Payment failed. Please try again.",
        );

        return false;
      } finally {
        setPayingShareId(null);
      }
    },
    [],
  );

  return {
    bills,
    loading,
    error,
    payingShareId,
    payShare,
    loadBills,
    clearError: () => setError(null),
  };
}
