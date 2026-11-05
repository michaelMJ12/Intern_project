import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

const API_BASE = "http://127.0.0.1:8787/api";
const REQUEST_TIMEOUT_MS = 15000;

interface Home {
  id: string;
  name: string;
}

interface Member {
  id: string;
  homeId: string;
  name: string;
}

interface Share {
  id: string;
  memberId: string;
  amountCents: number;
  paidAt: string | null;
}

interface Bill {
  id: string;
  homeId: string;
  title: string;
  totalCents: number;
  shares: Share[];
}

interface Balance {
  memberId: string;
  name: string;
  outstandingCents: number;
}

interface BalancesResponse {
  balances: Balance[];
}

/**
 * Safely reads an error message from an unknown JSON body.
 * Accepts { error: string } or { message: string }.
 */
function extractErrorMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }

  const record = data as Record<string, unknown>;
  const candidate = record["error"] ?? record["message"];

  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : null;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;

    try {
      response = await fetch(`${API_BASE}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // The server may still have processed the request. Callers keep their
        // idempotency key so a retry cannot create a duplicate.
        throw new Error(
          "The request timed out. Please try again; it will not be applied twice.",
        );
      }
      throw new Error("Unable to reach the server. Check your connection.");
    }

    const responseText = await response.text();
    let data: unknown = {};

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error("The server returned an invalid response.");
      }
    }

    if (!response.ok) {
      throw new Error(
        extractErrorMessage(data) ?? `Request failed (${response.status})`,
      );
    }

    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

function formatMoney(amountCents: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amountCents / 100);
}

/**
 * Strictly converts a user-typed naira amount to integer kobo.
 * Rejects (instead of silently rounding) anything with more than two decimals,
 * negatives, exponents, or non-numeric input. Avoids float multiplication.
 */
function parseAmountToCents(
  input: string,
): { cents: number } | { error: string } {
  const value = input.trim().replace(/,/g, "");

  if (!value) {
    return { error: "Enter a bill amount." };
  }

  if (!/^\d+(\.\d+)?$/.test(value)) {
    return { error: "Enter a valid amount using digits only, e.g. 15000.50." };
  }

  const [whole = "", fraction = ""] = value.split(".");

  if (fraction.length > 2) {
    return { error: "Amount can have at most 2 decimal places." };
  }

  if (whole.length > 12) {
    return { error: "Amount is too large." };
  }

  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  return { cents };
}

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [homeName, setHomeName] = useState("");
  const [homeIdInput, setHomeIdInput] = useState("");
  const [activeHome, setActiveHome] = useState<Home | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);

  const [memberName, setMemberName] = useState("");
  const [billTitle, setBillTitle] = useState("");
  const [billAmount, setBillAmount] = useState("");

  const [loading, setLoading] = useState(false);
  // A Set so several members can pay at the same time.
  const [payingShareIds, setPayingShareIds] = useState<Set<string>>(
    new Set(),
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Idempotency keys survive failed/timed-out attempts so a retry reuses them.
  const paymentKeys = useRef(new Map<string, string>());
  const mutationKeys = useRef(new Map<string, string>());

  // Synchronous guards: React state updates are async, so two fast clicks can
  // both see "not busy" if we rely on state alone.
  const inFlightPayments = useRef(new Set<string>());
  const busyRef = useRef(false);

  // Incremented whenever the active home changes so late responses from a
  // previous home are ignored.
  const sessionRef = useRef(0);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const getMutationKey = (scope: string): string => {
    let key = mutationKeys.current.get(scope);
    if (!key) {
      key = `mutation-${crypto.randomUUID()}`;
      mutationKeys.current.set(scope, key);
    }
    return key;
  };

  // Runs a form action once at a time (blocks double submit, incl. Enter key).
  const runExclusive = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  // GET /homes/:homeId/balances
  const loadBalances = async (homeId: string, session: number) => {
    const result = await apiRequest<BalancesResponse>(
      `/homes/${homeId}/balances`,
    );

    const next = result.balances ?? [];
    if (session === sessionRef.current) {
      setBalances(next);
    }
    return next;
  };

  // Refresh after a successful write. A refresh failure must NOT be reported
  // as if the write itself failed.
  const refreshBalancesSafely = async (homeId: string, session: number) => {
    try {
      await loadBalances(homeId, session);
      return true;
    } catch {
      if (session === sessionRef.current) {
        setError(
          "Saved, but balances could not be refreshed. Use \"Refresh balances\".",
        );
      }
      return false;
    }
  };

  const resetHomeData = () => {
    sessionRef.current += 1;
    setMembers([]);
    setBills([]);
    setBalances([]);
    paymentKeys.current.clear();
    mutationKeys.current.clear();
  };

  // POST /homes
  const createHome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    const name = homeName.trim();

    if (!name) {
      setError("Enter a home name.");
      return;
    }

    if (name.length > 100) {
      setError("Home name must be 100 characters or fewer.");
      return;
    }

    await runExclusive(async () => {
      const key = getMutationKey(`home:${name.toLowerCase()}`);

      try {
        const home = await apiRequest<Home>("/homes", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({ name }),
        });

        mutationKeys.current.delete(`home:${name.toLowerCase()}`);
        resetHomeData();
        setActiveHome(home);
        setHomeIdInput(home.id);
        setHomeName("");

        setSuccess(`Home "${home.name}" was created successfully.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to create home.");
      }
    });
  };

  // Load an existing home using its ID.
  // The confirmed GET endpoint available here is the balances endpoint.
  const loadHome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    const id = homeIdInput.trim();

    if (!id) {
      setError("Enter a home ID.");
      return;
    }

    await runExclusive(async () => {
      try {
        const loadedBalances = await apiRequest<BalancesResponse>(
          `/homes/${encodeURIComponent(id)}/balances`,
        );

        resetHomeData();
        setBalances(loadedBalances.balances ?? []);
        setActiveHome({
          id,
          name: "Existing home",
        });

        setSuccess("Home balances loaded successfully.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load home.");
      }
    });
  };

  // POST /homes/:homeId/members
  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    if (!activeHome) {
      setError("Create or load a home first.");
      return;
    }

    const name = memberName.trim();

    if (!name) {
      setError("Enter the member's name.");
      return;
    }

    if (name.length > 100) {
      setError("Member name must be 100 characters or fewer.");
      return;
    }

    const home = activeHome;
    const session = sessionRef.current;

    await runExclusive(async () => {
      const scope = `member:${home.id}:${name.toLowerCase()}`;
      const key = getMutationKey(scope);

      try {
        const member = await apiRequest<Member>(
          `/homes/${home.id}/members`,
          {
            method: "POST",
            headers: { "Idempotency-Key": key },
            body: JSON.stringify({ name }),
          },
        );

        mutationKeys.current.delete(scope);

        if (session !== sessionRef.current) return;

        setMembers((current) =>
          current.some((item) => item.id === member.id)
            ? current
            : [...current, member],
        );
        setMemberName("");
        setSuccess(`${member.name} was added successfully.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to add member.");
        return;
      }

      await refreshBalancesSafely(home.id, session);
    });
  };

  // POST /homes/:homeId/bills
  const createBill = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessages();

    if (!activeHome) {
      setError("Create or load a home first.");
      return;
    }

    const title = billTitle.trim();

    if (!title) {
      setError("Enter a bill title.");
      return;
    }

    if (title.length > 120) {
      setError("Bill title must be 120 characters or fewer.");
      return;
    }

    const parsed = parseAmountToCents(billAmount);

    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    // UX guard only. The backend must also reject bills for empty households.
    if (balances.length === 0 && members.length === 0) {
      setError("Add at least one member before creating a bill.");
      return;
    }

    const totalCents = parsed.cents;
    const home = activeHome;
    const session = sessionRef.current;

    await runExclusive(async () => {
      const scope = `bill:${home.id}:${title.toLowerCase()}:${totalCents}`;
      const key = getMutationKey(scope);

      try {
        const bill = await apiRequest<Bill>(`/homes/${home.id}/bills`, {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: JSON.stringify({
            title,
            totalCents,
          }),
        });

        mutationKeys.current.delete(scope);

        if (session !== sessionRef.current) return;

        // The POST response contains the bill and its shares.
        // Keep it in local state because a GET bills endpoint
        // has not yet been confirmed.
        setBills((current) =>
          current.some((item) => item.id === bill.id)
            ? current
            : [bill, ...current],
        );

        setBillTitle("");
        setBillAmount("");
        setSuccess("Bill created successfully.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to create bill.");
        return;
      }

      await refreshBalancesSafely(home.id, session);
    });
  };

  // POST /bills/:billId/shares/:shareId/pay
  const payShare = async (billId: string, shareId: string) => {
    if (!activeHome) return;

    // Synchronous duplicate-click guard.
    if (inFlightPayments.current.has(shareId)) return;

    // Already paid locally: nothing to do.
    const alreadyPaid = bills
      .find((bill) => bill.id === billId)
      ?.shares.find((share) => share.id === shareId)?.paidAt;
    if (alreadyPaid) return;

    inFlightPayments.current.add(shareId);
    setPayingShareIds((current) => new Set(current).add(shareId));

    clearMessages();

    const homeId = activeHome.id;
    const session = sessionRef.current;

    let idempotencyKey = paymentKeys.current.get(shareId);

    if (!idempotencyKey) {
      idempotencyKey = `payment-${crypto.randomUUID()}`;
      paymentKeys.current.set(shareId, idempotencyKey);
    }

    let paid = false;

    try {
      const updatedShare = await apiRequest<Share>(
        `/bills/${billId}/shares/${shareId}/pay`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
        },
      );

      paid = true;
      // Only drop the key once the server has confirmed the payment.
      paymentKeys.current.delete(shareId);

      if (session === sessionRef.current) {
        setBills((current) =>
          current.map((bill) =>
            bill.id !== billId
              ? bill
              : {
                  ...bill,
                  shares: bill.shares.map((share) =>
                    share.id === shareId ? updatedShare : share,
                  ),
                },
          ),
        );

        setSuccess("Payment recorded successfully.");
      }
    } catch (err) {
      // Failure or timeout: keep the key so a retry is the SAME payment.
      if (session === sessionRef.current) {
        setError(err instanceof Error ? err.message : "Payment failed.");
      }
    } finally {
      inFlightPayments.current.delete(shareId);
      setPayingShareIds((current) => {
        const next = new Set(current);
        next.delete(shareId);
        return next;
      });
    }

    if (paid) {
      await refreshBalancesSafely(homeId, session);
    }
  };

  const totalOutstanding = balances.reduce(
    (total, balance) => total + balance.outstandingCents,
    0,
  );

  const totalBills = bills.reduce(
    (total, bill) => total + bill.totalCents,
    0,
  );

  const totalPaid = bills.reduce(
    (total, bill) =>
      total +
      bill.shares.reduce(
        (shareTotal, share) =>
          shareTotal + (share.paidAt ? share.amountCents : 0),
        0,
      ),
    0,
  );

  const hasMembers = balances.length > 0 || members.length > 0;

  return (
    <main className="app-container">
      <header className="app-header">
        <div>
          <p className="eyebrow">HOUSEHOLD FINANCE</p>
          <h1>Shared Bill Splitter</h1>
          <p className="subtitle">
            Manage shared expenses, track payments and see what everyone owes.
          </p>
        </div>
        <span className="status-indicator">API connected locally</span>
      </header>

      {error && (
        <div className="message error-message" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>×</button>
        </div>
      )}

      {success && (
        <div className="message success-message" role="status">
          {success}
          <button type="button" onClick={() => setSuccess("")}>×</button>
        </div>
      )}

      <section className="setup-grid">
        <form className="panel" onSubmit={createHome}>
          <h2>Create a home</h2>
          <p className="muted">Start a new shared household.</p>

          <label htmlFor="homeName">Home name</label>
          <input
            id="homeName"
            value={homeName}
            maxLength={100}
            onChange={(event) => setHomeName(event.target.value)}
            placeholder="e.g. Michael's Apartment"
          />

          <button disabled={loading} type="submit">
            {loading ? "Please wait..." : "Create home"}
          </button>
        </form>

        <form className="panel" onSubmit={loadHome}>
          <h2>Open an existing home</h2>
          <p className="muted">Use your existing home ID.</p>

          <label htmlFor="homeId">Home ID</label>
          <input
            id="homeId"
            value={homeIdInput}
            onChange={(event) => setHomeIdInput(event.target.value)}
            placeholder="Enter home UUID"
          />

          <button disabled={loading} type="submit">
            {loading ? "Loading..." : "Load home"}
          </button>
        </form>
      </section>

      {activeHome && (
        <>
          <section className="active-home panel">
            <div>
              <p className="eyebrow">ACTIVE HOUSEHOLD</p>
              <h2>{activeHome.name}</h2>
              <p className="muted home-id">{activeHome.id}</p>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={loading}
              onClick={() =>
                runExclusive(async () => {
                  clearMessages();
                  const session = sessionRef.current;
                  try {
                    await loadBalances(activeHome.id, session);
                    setSuccess("Balances refreshed.");
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Refresh failed.",
                    );
                  }
                })
              }
            >
              Refresh balances
            </button>
          </section>

          <section className="stats-grid">
            <div className="stat-card">
              <span>Total bills created this session</span>
              <strong>{formatMoney(totalBills)}</strong>
            </div>
            <div className="stat-card">
              <span>Payments recorded this session</span>
              <strong>{formatMoney(totalPaid)}</strong>
            </div>
            <div className="stat-card">
              <span>Outstanding balance</span>
              <strong>{formatMoney(totalOutstanding)}</strong>
            </div>
            <div className="stat-card">
              <span>Members added this session</span>
              <strong>{members.length}</strong>
            </div>
          </section>

          <section className="management-grid">
            <form className="panel" onSubmit={addMember}>
              <h2>Add a member</h2>
              <p className="muted">Add someone to this household.</p>

              <label htmlFor="memberName">Member name</label>
              <input
                id="memberName"
                value={memberName}
                maxLength={100}
                onChange={(event) => setMemberName(event.target.value)}
                placeholder="e.g. Michael"
              />

              <button disabled={loading} type="submit">
                Add member
              </button>

              {members.length > 0 && (
                <div className="member-list">
                  <h3>Members added this session</h3>
                  {members.map((member) => (
                    <div className="member-row" key={member.id}>
                      <span>{member.name}</span>
                      <span className="muted">Added</span>
                    </div>
                  ))}
                </div>
              )}
            </form>

            <form className="panel" onSubmit={createBill}>
              <h2>Create a bill</h2>
              <p className="muted">
                {hasMembers
                  ? "The API will split the amount among the home's members."
                  : "Add at least one member before creating a bill."}
              </p>

              <label htmlFor="billTitle">Bill title</label>
              <input
                id="billTitle"
                value={billTitle}
                maxLength={120}
                onChange={(event) => setBillTitle(event.target.value)}
                placeholder="e.g. November Electricity Bill"
              />

              <label htmlFor="billAmount">Total amount (₦)</label>
              <input
                id="billAmount"
                type="text"
                inputMode="decimal"
                value={billAmount}
                onChange={(event) => setBillAmount(event.target.value)}
                placeholder="15000"
              />

              <button disabled={loading || !hasMembers} type="submit">
                Create bill and split
              </button>
            </form>
          </section>

          <section className="panel balances-panel">
            <div className="section-heading">
              <div>
                <h2>Member balances</h2>
                <p className="muted">
                  Outstanding amounts returned by your balances API.
                </p>
              </div>
              <span className="count-pill">{balances.length} members</span>
            </div>

            {balances.length === 0 ? (
              <p className="empty-state">
                No balance records were returned for this home.
              </p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Member ID</th>
                      <th>Outstanding balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((balance) => (
                      <tr key={balance.memberId}>
                        <td>{balance.name}</td>
                        <td className="id-cell">{balance.memberId}</td>
                        <td>
                          <strong>
                            {formatMoney(balance.outstandingCents)}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bills-section">
            <div className="section-heading">
              <div>
                <h2>Recent bills</h2>
                <p className="muted">
                  Bills created during this browser session.
                </p>
              </div>
              <span className="count-pill">{bills.length} bills</span>
            </div>

            {bills.length === 0 ? (
              <div className="panel empty-state">
                <h3>No bills created in this session</h3>
                <p>
                  Create a bill above to see its shares and payment status here.
                </p>
              </div>
            ) : (
              <div className="bill-grid">
                {bills.map((bill) => {
                  const paidAmount = bill.shares.reduce(
                    (sum, share) =>
                      sum + (share.paidAt ? share.amountCents : 0),
                    0,
                  );

                  return (
                    <article className="panel bill-card" key={bill.id}>
                      <div className="bill-header">
                        <div>
                          <p className="eyebrow">SHARED EXPENSE</p>
                          <h3>{bill.title}</h3>
                        </div>
                        <span className="count-pill">
                          {bill.shares.length} shares
                        </span>
                      </div>

                      <strong className="bill-total">
                        {formatMoney(bill.totalCents)}
                      </strong>

                      <div className="bill-progress">
                        <div className="progress-label">
                          <span>Paid</span>
                          <strong>{formatMoney(paidAmount)}</strong>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${
                                bill.totalCents > 0
                                  ? Math.min(
                                      100,
                                      (paidAmount / bill.totalCents) * 100,
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="share-list">
                        {bill.shares.map((share) => {
                          const member = balances.find(
                            (item) => item.memberId === share.memberId,
                          );
                          const localMember = members.find(
                            (item) => item.id === share.memberId,
                          );

                          const name =
                            member?.name ||
                            localMember?.name ||
                            "Household member";

                          const isPaying = payingShareIds.has(share.id);

                          return (
                            <div className="share-row" key={share.id}>
                              <div className="share-details">
                                <strong>{name}</strong>
                                <span className="muted">
                                  {formatMoney(share.amountCents)}
                                </span>
                              </div>

                              {share.paidAt ? (
                                <span className="paid-status">Paid</span>
                              ) : (
                                <button
                                  className="pay-button"
                                  type="button"
                                  disabled={isPaying}
                                  onClick={() =>
                                    payShare(bill.id, share.id)
                                  }
                                >
                                  {isPaying ? "Processing..." : "Mark as paid"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
