// TEMPORARY ACCESS-RESTRICTED HOLDING PAGE
// ------------------------------------------------------------------
// This file temporarily replaces the live application while an
// outstanding payment is being resolved.
//
// TO REVERT:
// 1. Delete this file.
// 2. Rename App.original.tsx.bak -> App.tsx.
// 3. Redeploy.
// ------------------------------------------------------------------

export default function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "2rem",
        background: "linear-gradient(135deg, #050816 0%, #0b1020 100%)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "760px",
          background: "#111827",
          border: "1px solid rgba(239,68,68,.3)",
          borderRadius: "18px",
          padding: "3rem",
          color: "#F8FAFC",
          boxShadow: "0 25px 80px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: ".45rem .9rem",
            borderRadius: "999px",
            background: "rgba(239,68,68,.12)",
            border: "1px solid rgba(239,68,68,.35)",
            color: "#FCA5A5",
            fontWeight: 700,
            letterSpacing: ".08em",
            fontSize: ".8rem",
            textTransform: "uppercase",
            marginBottom: "1.5rem",
          }}
        >
          403 • ACCESS RESTRICTED
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: "2.3rem",
            fontWeight: 800,
            color: "#FFFFFF",
          }}
        >
          Website Temporarily Disabled
        </h1>

        <p
          style={{
            marginTop: "1.75rem",
            fontSize: "1.05rem",
            lineHeight: 1.8,
            color: "#CBD5E1",
          }}
        >
          This website has been intentionally disabled by its developer due to
          an outstanding contractual payment that remains unpaid.
        </p>

        <div
          style={{
            marginTop: "1.8rem",
            padding: "1.25rem",
            borderRadius: "12px",
            border: "1px solid rgba(245,158,11,.35)",
            background: "rgba(245,158,11,.08)",
          }}
        >
          <div
            style={{
              color: "#FBBF24",
              fontWeight: 800,
              fontSize: "1.05rem",
              marginBottom: ".6rem",
            }}
          >
            PAYMENT STATUS
          </div>

          <div
            style={{
              color: "#FFFFFF",
              fontWeight: 700,
              fontSize: "1.1rem",
            }}
          >
            PAYMENT FROM ELITE TECH IS STILL OUTSTANDING.
          </div>
        </div>

        <p
          style={{
            marginTop: "2rem",
            fontSize: "1rem",
            lineHeight: 1.8,
            color: "#CBD5E1",
          }}
        >
          Public access has been suspended until the outstanding balance is
          settled. Once payment has been received and confirmed, this website
          will be restored to its normal operation immediately.
        </p>

        <div
          style={{
            marginTop: "2rem",
            border: "1px solid #243046",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: "#0F172A",
              padding: "1rem 1.25rem",
              fontWeight: 700,
              color: "#FFFFFF",
            }}
          >
            Current Status
          </div>

          <div
            style={{
              padding: "1.25rem",
              color: "#CBD5E1",
              lineHeight: 2,
            }}
          >
            <div>
              <strong>Status:</strong> Website Disabled
            </div>

            <div>
              <strong>Reason:</strong> Outstanding Development Payment
            </div>

            <div>
              <strong>Project:</strong> PIS Website 
            </div>

            <div>
              <strong>Access:</strong> Suspended Until Payment Is Received
            </div>

            <div>
              <strong>HTTP Response:</strong> 403 Forbidden 
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "2.5rem",
            paddingTop: "1.5rem",
            borderTop: "1px solid #243046",
            color: "#94A3B8",
            fontSize: ".95rem",
            lineHeight: 1.8,
          }}
        >
          This restriction is temporary and will be removed immediately after
          the outstanding payment obligation has been fulfilled.
        </div>
      </div>
    </div>
  );
}
