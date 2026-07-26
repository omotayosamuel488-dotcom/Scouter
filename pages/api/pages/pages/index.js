import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BATCH_SIZE = 15;

function extractEmails(text) {
  const found = text.match(EMAIL_RE) || [];
  return Array.from(new Set(found.map((e) => e.toLowerCase())));
}

export default function Home() {
  const [fileName, setFileName] = useState(null);
  const [emails, setEmails] = useState([]);
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    setResults([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      if (file.name.endsWith(".csv")) {
        const parsed = Papa.parse(text);
        const flat = parsed.data.flat().join(" ");
        setEmails(extractEmails(flat));
      } else {
        setEmails(extractEmails(text));
      }
    };
    reader.readAsText(file);
  }, []);

  const runScout = async () => {
    if (emails.length === 0) return;
    setRunning(true);
    setResults([]);
    let remaining = [...emails];
    let done = 0;

    while (remaining.length > 0) {
      const batch = remaining.slice(0, BATCH_SIZE);
      remaining = remaining.slice(BATCH_SIZE);
      setProgress(`scanning ${done + 1}\u2013${done + batch.length} of ${emails.length}`);

      try {
        const res = await fetch("/api/scout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: batch }),
        });
        const data = await res.json();
        if (data.results) {
          setResults((prev) => [...prev, ...data.results]);
        } else if (data.error) {
          setResults((prev) => [
            ...prev,
            ...batch.map((email) => ({ email, status: "error", reason: data.error })),
          ]);
          remaining = []; // stop on config errors (e.g. missing API key)
        }
      } catch (err) {
        setResults((prev) => [
          ...prev,
          ...batch.map((email) => ({ email, status: "error", reason: String(err) })),
        ]);
      }

      done += batch.length;
    }

    setProgress(null);
    setRunning(false);
  };

  const exportCsv = () => {
    const rows = results.map((r) => ({
      email: r.email,
      status: r.status,
      domain: r.store?.domain || "",
      store_name: r.store?.storeName || "",
      product_count: r.store?.productCount ?? "",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scouter-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const foundCount = results.filter((r) => r.status === "found").length;

  return (
    <div className="wrap">
      <p className="eyebrow">Scouter // lead recon</p>
      <h1>Find the store behind the inbox.</h1>
      <p className="sub">
        Upload a list of emails. Scouter searches each one, then checks whether it
        leads back to a live Shopify store — verified, not guessed.
      </p>

      <div
        className={`dropzone ${dragActive ? "active" : ""} ${running ? "scanning" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="label">
          {fileName ? "drop a different file, or click to browse" : "drop a .csv or .txt file, or click to browse"}
        </div>
        {fileName && (
          <div className="filename">
            {fileName} \u2014 {emails.length} email{emails.length === 1 ? "" : "s"} detected
          </div>
        )}
      </div>

      <button className="run" disabled={emails.length === 0 || running} onClick={runScout}>
        {running ? "scanning\u2026" : `scout ${emails.length || ""} email${emails.length === 1 ? "" : "s"}`}
      </button>

      {progress && <div className="status-line">{progress}</div>}

      {results.length > 0 && (
        <div className="log">
          <div className="log-header">
            <span>
              {foundCount} match{foundCount === 1 ? "" : "es"} / {results.length} scanned
            </span>
            <button onClick={exportCsv}>export csv</button>
          </div>
          {results.map((r, i) => (
            <div className="row" key={i}>
              <span className="email">{r.email}</span>
              <span className={`tag ${r.status}`}>{r.status.replace(/_/g, " ")}</span>
              {r.store && (
                <span className="detail">
                  {r.store.domain}
                  {r.store.storeName ? ` \u2014 ${r.store.storeName}` : ""}
                  {r.store.productCount != null ? ` \u2014 ${r.store.productCount}+ products` : ""}
                </span>
              )}
              {r.reason && <span className="detail">{r.reason}</span>}
            </div>
          ))}
        </div>
      )}

      <p className="note">
        Matching runs on public search results, so coverage depends on what's indexed \u2014
        expect partial, not total, hit rates. Requires a <code>SERPAPI_KEY</code> set in
        your hosting environment.
      </p>
    </div>
  );
                         }
