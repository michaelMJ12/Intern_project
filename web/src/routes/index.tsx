import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

const API_BASE = "http://127.0.0.1:8787/api";

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

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const responseText = await response.text();
  let data: any = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("The server returned an invalid response.");
    }
  }

  if (!response.ok) {
    throw new Error(
      data.error || data.message || `Request failed (${response.status})`,
    );
  }

  return data as T;
}

function formatMoney(amountCents: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amountCents / 100);
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
  const [payingShareId, setPayingShareId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Keep the same idempotency key when retrying a failed payment.
  const paymentKeys = useRef(new Map<string, string>());

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  // GET /homes/:homeId/balances
  const loadBalances = async (homeId: string) => {
    const result = await apiRequest<BalancesResponse>(
      `/homes/${homeId}/balances`,
    );

    setBalances(result.balances ?? []);
    return result.balances ?? [];
  };

  const resetHomeData = () => {
    setMembers([]);
    setBills([]);
    setBalances([]);
    paymentKeys.current.clear();
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

    setLoading(true);

    try {
      const home = await apiRequest<Home>("/homes", {
        method: "POST",
        body: JSON.stringify({ name }),
      });

      resetHomeData();
      setActiveHome(home);
      setHomeIdInput(home.id);
      setHomeName("");

      setSuccess(`Home "${home.name}" was created successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create home.");
    } finally {
      setLoading(false);
    }
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

    setLoading(true);

    try {
      const loadedBalances = await apiRequest<BalancesResponse>(
        `/homes/${id}/balances`,
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
    } finally {
      setLoading(false);
    }
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

    setLoading(true);

    try {
      const member = await apiRequest<Member>(
        `/homes/${activeHome.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({ name }),
        },
      );

      setMembers((current) => [...current, member]);
      setMemberName("");
      setSuccess(`${member.name} was added successfully.`);

      await loadBalances(activeHome.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add member.");
    } finally {
      setLoading(false);
    }
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
    const amount = Number(billAmount);

    if (!title) {
      setError("Enter a bill title.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid bill amount.");
      return;
    }

    const totalCents = Math.round(amount * 100);

    setLoading(true);

    try {
      const bill = await apiRequest<Bill>(
        `/homes/${activeHome.id}/bills`,
        {
          method: "POST",
          body: JSON.stringify({
            title,
            totalCents,
          }),
        },
      );

      // The POST response contains the bill and its shares.
      // Keep it in local state because a GET bills endpoint
      // has not yet been confirmed.
      setBills((current) => [bill, ...current]);

      setBillTitle("");
      setBillAmount("");

      await loadBalances(activeHome.id);

      setSuccess("Bill created successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create bill.");
    } finally {
      setLoading(false);
    }
  };

  // POST /bills/:billId/shares/:shareId/pay
  const payShare = async (billId: string, shareId: string) => {
    if (!activeHome) return;

    clearMessages();
    setPayingShareId(shareId);

    let idempotencyKey = paymentKeys.current.get(shareId);

    if (!idempotencyKey) {
      idempotencyKey = `payment-${crypto.randomUUID()}`;
      paymentKeys.current.set(shareId, idempotencyKey);
    }

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

      paymentKeys.current.delete(shareId);

      await loadBalances(activeHome.id);

      setSuccess("Payment recorded successfully.");
    } catch (err) {
      // Keep the key so a retry uses the same idempotency key.
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setPayingShareId(null);
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
              onClick={async () => {
                clearMessages();
                setLoading(true);
                try {
                  await loadBalances(activeHome.id);
                  setSuccess("Balances refreshed.");
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Refresh failed.",
                  );
                } finally {
                  setLoading(false);
                }
              }}
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
                The API will split the amount among the home's members.
              </p>

              <label htmlFor="billTitle">Bill title</label>
              <input
                id="billTitle"
                value={billTitle}
                onChange={(event) => setBillTitle(event.target.value)}
                placeholder="e.g. November Electricity Bill"
              />

              <label htmlFor="billAmount">Total amount (₦)</label>
              <input
                id="billAmount"
                type="number"
                min="0.01"
                step="0.01"
                value={billAmount}
                onChange={(event) => setBillAmount(event.target.value)}
                placeholder="15000"
              />

              <button disabled={loading} type="submit">
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
                                  disabled={payingShareId === share.id}
                                  onClick={() =>
                                    payShare(bill.id, share.id)
                                  }
                                >
                                  {payingShareId === share.id
                                    ? "Processing..."
                                    : "Mark as paid"}
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
