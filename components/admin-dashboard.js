"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createEmptyRecord, isRecordEmpty, REQUIRED_FIELDS } from "../lib/shared/records.js";

let nextDraftId = 1;
const INPUT_CONTRACT_TEXT =
  "Every member still requires the same fields the CSV contained: Salesforce contact id, firstName, lastName, email, and memberId.";

const createDraftRow = () => ({
  key: `row-${nextDraftId++}`,
  ...createEmptyRecord(),
});

const buildRows = (count) => Array.from({ length: count }, () => createDraftRow());

export default function AdminDashboard() {
  const [rows, setRows] = useState(() => buildRows(1));
  const [results, setResults] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInputContractOpen, setIsInputContractOpen] = useState(false);
  const inputContractTooltipId = useId();
  const resultsModalTitleId = useId();
  const inputContractTooltipRef = useRef(null);

  const activeRowCount = rows.filter((row) => !isRecordEmpty(row)).length;

  useEffect(() => {
    if (!isInputContractOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!inputContractTooltipRef.current?.contains(event.target)) {
        setIsInputContractOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsInputContractOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isInputContractOpen]);

  useEffect(() => {
    if (!results) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setResults(null);
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [results]);

  const updateRow = (key, field, value) => {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) {
          return row;
        }

        return {
          ...row,
          [field]: value,
        };
      }),
    );
  };

  const addRows = (count) => {
    setRows((current) => [...current, ...buildRows(count)]);
  };

  const removeRow = (key) => {
    setRows((current) => {
      if (current.length === 1) {
        return [createDraftRow()];
      }

      return current.filter((row) => row.key !== key);
    });
  };

  const clearAll = () => {
    setRows(buildRows(1));
    setResults(null);
    setErrorMessage("");
  };

  const submitBatch = async () => {
    const payload = rows.filter((row) => !isRecordEmpty(row)).map(({ key, ...record }) => record);

    if (payload.length === 0) {
      setErrorMessage("Add at least one member before submitting the batch.");
      return;
    }

    setIsSubmitting(true);
    setResults(null);
    setErrorMessage("");

    try {
      const response = await fetch("/api/cards/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: payload }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Batch processing failed.");
      }

      setResults(data);
    } catch (error) {
      setErrorMessage(error.message || "Batch processing failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="dashboard-grid">
      <div className="stack">
        <article className="panel panel-dark">
          <div className="panel-body">
            <div className="panel-heading">
              <h2>Batch controls</h2>
              <div
                className="tooltip-shell"
                data-open={isInputContractOpen ? "true" : "false"}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsInputContractOpen(false);
                  }
                }}
                ref={inputContractTooltipRef}
              >
                <button
                  aria-describedby={inputContractTooltipId}
                  aria-expanded={isInputContractOpen}
                  aria-label="Show input contract"
                  className="tooltip-trigger"
                  onClick={() => setIsInputContractOpen((current) => !current)}
                  type="button"
                >
                  <span aria-hidden="true" className="tooltip-trigger-icon">
                    i
                  </span>
                </button>
                <div className="tooltip-bubble" id={inputContractTooltipId} role="tooltip">
                  <p className="meta-copy">{INPUT_CONTRACT_TEXT}</p>
                </div>
              </div>
            </div>
            <p className="helper-copy">
              Each submission runs the same backend sequence as the legacy script: create the pass, update the
              Salesforce contact, then send the Postmark template email.
            </p>
            <div className="summary-list">
              <div className="summary-item">
                <span>Editable rows</span>
                <strong>{rows.length}</strong>
              </div>
              <div className="summary-item">
                <span>Ready to submit</span>
                <strong>{activeRowCount}</strong>
              </div>
              <div className="summary-item">
                <span>Required fields</span>
                <strong>{REQUIRED_FIELDS.length}</strong>
              </div>
            </div>
          </div>
        </article>
      </div>

      <div className="stack">
        <article className="panel">
          <div className="panel-body form-panel">
            <div className="toolbar">
              <div>
                <h2>Admin intake</h2>
                <p className="helper-copy">
                  Enter a single member or build a multi-member batch. Empty rows are ignored automatically.
                </p>
              </div>
            </div>

            <div className="record-list">
              {rows.length === 0 ? (
                <div className="empty-state">No rows available.</div>
              ) : (
                rows.map((row, index) => (
                  <article className="record-card" key={row.key}>
                    <div className="record-header">
                      <strong>Member {index + 1}</strong>
                      <button className="button button-ghost" type="button" onClick={() => removeRow(row.key)}>
                        Remove
                      </button>
                    </div>
                    <div className="field-grid">
                      <div className="field field-full">
                        <label htmlFor={`id-${row.key}`}>Salesforce Contact ID</label>
                        <input
                          id={`id-${row.key}`}
                          name="id"
                          value={row.id}
                          onChange={(event) => updateRow(row.key, "id", event.target.value)}
                          placeholder="003..."
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`firstName-${row.key}`}>First name</label>
                        <input
                          id={`firstName-${row.key}`}
                          name="firstName"
                          value={row.firstName}
                          onChange={(event) => updateRow(row.key, "firstName", event.target.value)}
                          placeholder="Angelique"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`lastName-${row.key}`}>Last name</label>
                        <input
                          id={`lastName-${row.key}`}
                          name="lastName"
                          value={row.lastName}
                          onChange={(event) => updateRow(row.key, "lastName", event.target.value)}
                          placeholder="Musico"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`email-${row.key}`}>Email</label>
                        <input
                          id={`email-${row.key}`}
                          name="email"
                          type="email"
                          value={row.email}
                          onChange={(event) => updateRow(row.key, "email", event.target.value)}
                          placeholder="member@example.com"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`memberId-${row.key}`}>Member ID</label>
                        <input
                          id={`memberId-${row.key}`}
                          name="memberId"
                          value={row.memberId}
                          onChange={(event) => updateRow(row.key, "memberId", event.target.value)}
                          placeholder="6453275"
                        />
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="form-footer-actions">
              <button className="button button-secondary" type="button" onClick={() => addRows(1)}>
                Add row
              </button>
              <button className="button button-secondary" type="button" onClick={() => addRows(5)}>
                Add 5 rows
              </button>
            </div>

            {errorMessage ? <div className="status-banner status-error">{errorMessage}</div> : null}
          </div>
        </article>
      </div>

      {results ? (
        <div className="results-modal-backdrop" onClick={() => setResults(null)} role="presentation">
          <article
            aria-labelledby={resultsModalTitleId}
            aria-modal="true"
            className="panel results-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-body">
              <div className="results-modal-header">
                <div>
                  <h2 id={resultsModalTitleId}>Batch results</h2>
                  <p className="helper-copy">
                    Successful records include pass links. Failed records return the backend error so the admin can
                    retry only the rows that need attention.
                  </p>
                </div>
                <button
                  aria-label="Close batch results"
                  className="button results-modal-close"
                  onClick={() => setResults(null)}
                  type="button"
                >
                  <span aria-hidden="true">x</span>
                </button>
              </div>

              <div className="results-summary">
                <div className="summary-stat">
                  <span>Total</span>
                  <strong>{results.summary.total}</strong>
                </div>
                <div className="summary-stat">
                  <span>Succeeded</span>
                  <strong>{results.summary.succeeded}</strong>
                </div>
                <div className="summary-stat">
                  <span>Failed</span>
                  <strong>{results.summary.failed}</strong>
                </div>
                <div className="summary-stat">
                  <span>Concurrency</span>
                  <strong>{results.summary.concurrency}</strong>
                </div>
              </div>

              {results.summary.failed === 0 ? (
                <div className="status-banner status-success" style={{ marginTop: "18px" }}>
                  All records completed successfully.
                </div>
              ) : null}

              <div className="results-grid">
                {results.results.map((result) => (
                  <article className="result-card" key={`${result.index}-${result.input.email}`}>
                    <header>
                      <div>
                        <strong>
                          {result.input.firstName} {result.input.lastName}
                        </strong>
                        <p className="meta-copy">{result.input.email}</p>
                      </div>
                      <span className={`status-chip ${result.status === "success" ? "chip-success" : "chip-failed"}`}>
                        {result.status}
                      </span>
                    </header>

                    {result.status === "success" ? (
                      <>
                        <p className="meta-copy">Litecard pass created and follow-up systems were updated.</p>
                        <div className="result-meta">
                          <span>Card ID: {result.output.pass.cardId}</span>
                          <span>Contact ID: {result.input.id}</span>
                          <span>Member ID: {result.input.memberId}</span>
                        </div>
                        <div className="result-links">
                          <a href={result.output.pass.appleLink} target="_blank" rel="noreferrer">
                            Apple Wallet link
                          </a>
                          <a href={result.output.pass.googleLink} target="_blank" rel="noreferrer">
                            Google Wallet link
                          </a>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="meta-copy">{result.error}</p>
                        <div className="result-meta">
                          <span>Contact ID: {result.input.id}</span>
                          <span>Member ID: {result.input.memberId}</span>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </article>
        </div>
      ) : null}

      <div className="floating-action-dock" role="toolbar" aria-label="Batch actions">
        <button className="button button-floating-ghost" type="button" onClick={clearAll}>
          Reset
        </button>
        <button className="button button-floating-primary" type="button" onClick={submitBatch} disabled={isSubmitting}>
          {isSubmitting ? "Processing..." : "Process batch"}
        </button>
      </div>
    </section>
  );
}
