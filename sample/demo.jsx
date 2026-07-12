import React, { useState, useMemo } from "react";

export default function PositionSizer() {
  const [equity, setEquity] = useState(100000);
  const [riskPct, setRiskPct] = useState(1.0);
  const [entry, setEntry] = useState(50);
  const [stop, setStop] = useState(48);

  const { shares, dollarRisk, notional } = useMemo(() => {
    const perShare = Math.abs(entry - stop);
    const dollarRisk = equity * (riskPct / 100);
    const shares = perShare > 0 ? Math.floor(dollarRisk / perShare) : 0;
    return { shares, dollarRisk, notional: shares * entry };
  }, [equity, riskPct, entry, stop]);

  const field = (label, value, set, step) => (
    <label style={{ display: "block", margin: "10px 0" }}>
      <span style={{ display: "inline-block", width: 160, color: "#555" }}>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => set(parseFloat(e.target.value) || 0)}
        style={{ padding: "6px 8px", width: 140 }}
      />
    </label>
  );

  return (
    <div style={{ fontFamily: "Segoe UI, sans-serif", maxWidth: 520, margin: "40px auto", padding: 24, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>Fixed-Fractional Position Sizer</h2>
      {field("Account equity ($)", equity, setEquity, 1000)}
      {field("Risk per trade (%)", riskPct, setRiskPct, 0.1)}
      {field("Entry price ($)", entry, setEntry, 0.01)}
      {field("Stop price ($)", stop, setStop, 0.01)}
      <hr />
      <p><strong>Shares:</strong> {shares.toLocaleString()}</p>
      <p><strong>Dollar risk:</strong> ${dollarRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
      <p><strong>Notional:</strong> ${notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
    </div>
  );
}
