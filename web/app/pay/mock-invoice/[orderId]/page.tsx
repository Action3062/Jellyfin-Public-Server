"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { apiBase } from "../../../../lib/site";

/**
 * Development-only stand-in for the hosted NOWPayments invoice. The backing
 * API route only exists in mock mode (no NOWPAYMENTS_API_KEY outside
 * production), so this page is inert on real deployments.
 */
export default function MockInvoicePage() {
  const params = useParams<{ orderId: string }>();
  const [state, setState] = useState<"idle" | "busy" | "paid" | "error">("idle");

  async function simulate() {
    setState("busy");
    try {
      const res = await fetch(`${apiBase}/dev/simulate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: params.orderId })
      });
      setState(res.ok ? "paid" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <main className="page narrow">
      <section className="card" data-testid="mock-invoice">
        <h1>Mock Invoice</h1>
        <p className="hint">
          Order <code>{params.orderId}</code> — development environment only.
        </p>
        {state === "paid" ? (
          <div className="status success">Payment simulated. You can close this tab.</div>
        ) : (
          <button type="button" className="primary" disabled={state === "busy"} onClick={simulate} data-testid="simulate-payment">
            {state === "busy" ? <span className="spinner" /> : null} Simulate payment
          </button>
        )}
        {state === "error" && <div className="status error">Simulation failed (is the API in mock mode?)</div>}
      </section>
    </main>
  );
}
