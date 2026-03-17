"use client";

import { useEffect, useId, useRef, useState } from "react";
import { parseCsvContent } from "../lib/shared/csv.js";
import { createEmptyRecord, isRecordEmpty, REQUIRED_FIELDS, sanitizeBatchRecords } from "../lib/shared/records.js";

let nextDraftId = 1;
const INPUT_CONTRACT_TEXT =
  "Every member still requires the same fields the CSV contained: Salesforce contact id, firstName, lastName, email, and memberId.";
const DEFAULT_SERVER_CONFIG = {
  maxBatchSize: 50,
  requiredFields: REQUIRED_FIELDS,
  workerConcurrency: 5,
};

const createDraftRow = () => ({
  key: `row-${nextDraftId++}`,
  ...createEmptyRecord(),
});

const buildRows = (count) => Array.from({ length: count }, () => createDraftRow());
const chunkRecords = (records, chunkSize) => {
  const chunks = [];

  for (let index = 0; index < records.length; index += chunkSize) {
    chunks.push(records.slice(index, index + chunkSize));
  }

  return chunks;
};

const buildResultsPayload = ({
  chunkCount,
  chunkSize,
  concurrency,
  fileName = "",
  mode = "manual",
  partial = false,
  processedCount,
  results,
  total,
}) => {
  const succeeded = results.filter((result) => result.status === "success").length;
  const failed = results.filter((result) => result.status === "failed").length;

  return {
    meta: {
      chunkCount,
      chunkSize,
      fileName,
      mode,
      partial,
      processedCount,
      total,
    },
    results,
    summary: {
      concurrency,
      failed,
      succeeded,
      total,
    },
  };
};

export default function AdminDashboard() {
  const [rows, setRows] = useState(() => buildRows(1));
  const [results, setResults] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInputContractOpen, setIsInputContractOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("manual");
  const [processingStatus, setProcessingStatus] = useState(null);
  const [serverConfig, setServerConfig] = useState(DEFAULT_SERVER_CONFIG);
  const [csvUpload, setCsvUpload] = useState(null);
  const inputContractTooltipId = useId();
  const resultsModalTitleId = useId();
  const inputContractTooltipRef = useRef(null);

  const activeRowCount = rows.filter((row) => !isRecordEmpty(row)).length;
  const batchChunkSize = serverConfig.maxBatchSize || DEFAULT_SERVER_CONFIG.maxBatchSize;
  const currentRequiredFields = serverConfig.requiredFields?.length ? serverConfig.requiredFields : REQUIRED_FIELDS;
  const hasCsvUpload = Boolean(csvUpload?.records?.length);
  const isCsvTab = activeTab === "csv";
  const readyToSubmitCount = isCsvTab ? csvUpload?.records?.length || 0 : activeRowCount;

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

  useEffect(() => {
    let isMounted = true;

    const loadServerConfig = async () => {
      try {
        const response = await fetch("/api/cards/process", {
          cache: "no-store",
          method: "GET",
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (!isMounted) {
          return;
        }

        setServerConfig({
          maxBatchSize: Number(data.maxBatchSize) || DEFAULT_SERVER_CONFIG.maxBatchSize,
          requiredFields: Array.isArray(data.requiredFields) && data.requiredFields.length > 0 ? data.requiredFields : REQUIRED_FIELDS,
          workerConcurrency: Number(data.workerConcurrency) || DEFAULT_SERVER_CONFIG.workerConcurrency,
        });
      } catch {
        // Keep the built-in defaults when the config probe is unavailable.
      }
    };

    loadServerConfig();

    return () => {
      isMounted = false;
    };
  }, []);

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
    setActiveTab("manual");
    setCsvUpload(null);
    setProcessingStatus(null);
    setRows(buildRows(1));
    setResults(null);
    setErrorMessage("");
  };

  const clearCsvUpload = () => {
    setCsvUpload(null);
    setErrorMessage("");
  };

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setErrorMessage("");
    setResults(null);

    try {
      const content = await file.text();
      const { headers, rows: parsedRows } = parseCsvContent(content);
      const missingHeaders = currentRequiredFields.filter((field) => !headers.includes(field));

      if (missingHeaders.length > 0) {
        throw new Error(`CSV is missing required headers: ${missingHeaders.join(", ")}`);
      }

      const records = sanitizeBatchRecords(parsedRows);

      setActiveTab("csv");
      setCsvUpload({
        fileName: file.name,
        records,
      });
    } catch (error) {
      setCsvUpload(null);
      setErrorMessage(error.message || "Failed to parse the CSV file.");
    } finally {
      event.target.value = "";
    }
  };

  const processRecords = async ({ fileName = "", mode, records }) => {
    if (records.length === 0) {
      setErrorMessage(mode === "csv" ? "Upload a CSV with at least one member record." : "Add at least one member before submitting the batch.");
      return;
    }

    const chunks = chunkRecords(records, batchChunkSize);
    const aggregatedResults = [];
    let concurrency = serverConfig.workerConcurrency || DEFAULT_SERVER_CONFIG.workerConcurrency;

    setIsSubmitting(true);
    setProcessingStatus({
      currentChunk: chunks.length > 0 ? 1 : 0,
      fileName,
      mode,
      processed: 0,
      total: records.length,
      totalChunks: chunks.length,
    });
    setResults(null);
    setErrorMessage("");

    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        const offset = index * batchChunkSize;

        setProcessingStatus({
          currentChunk: index + 1,
          fileName,
          mode,
          processed: offset,
          total: records.length,
          totalChunks: chunks.length,
        });

        const response = await fetch("/api/cards/process", {
          body: JSON.stringify({ records: chunk }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `Chunk ${index + 1} failed to process.`);
        }

        concurrency = Number(data.summary?.concurrency) || concurrency;
        aggregatedResults.push(
          ...data.results.map((result) => ({
            ...result,
            index: offset + result.index,
          })),
        );

        setProcessingStatus({
          currentChunk: index + 1,
          fileName,
          mode,
          processed: Math.min(records.length, offset + chunk.length),
          total: records.length,
          totalChunks: chunks.length,
        });
      }

      setResults(
        buildResultsPayload({
          chunkCount: chunks.length,
          chunkSize: batchChunkSize,
          concurrency,
          fileName,
          mode,
          processedCount: aggregatedResults.length,
          results: aggregatedResults,
          total: records.length,
        }),
      );
    } catch (error) {
      if (aggregatedResults.length > 0) {
        setResults(
          buildResultsPayload({
            chunkCount: chunks.length,
            chunkSize: batchChunkSize,
            concurrency,
            fileName,
            mode,
            partial: true,
            processedCount: aggregatedResults.length,
            results: aggregatedResults,
            total: records.length,
          }),
        );
      }

      setErrorMessage(error.message || "Batch processing failed.");
    } finally {
      setIsSubmitting(false);
      setProcessingStatus(null);
    }
  };

  const submitBatch = async () => {
    const payload = isCsvTab ? csvUpload?.records || [] : rows.filter((row) => !isRecordEmpty(row)).map(({ key, ...record }) => record);

    await processRecords({
      fileName: csvUpload?.fileName || "",
      mode: isCsvTab ? "csv" : "manual",
      records: payload,
    });
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
                <span>Active tab</span>
                <strong>{isCsvTab ? "CSV upload" : "Manual entry"}</strong>
              </div>
              <div className="summary-item">
                <span>Ready to submit</span>
                <strong>{readyToSubmitCount}</strong>
              </div>
              <div className="summary-item">
                <span>Batch size cap</span>
                <strong>{batchChunkSize}</strong>
              </div>
              <div className="summary-item">
                <span>Required fields</span>
                <strong>{currentRequiredFields.length}</strong>
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
                  Enter members manually or upload the legacy CSV export. Large CSV files are processed in chunks of up
                  to {batchChunkSize} records.
                </p>
              </div>
            </div>

            <div className="intake-tabs" role="tablist" aria-label="Input methods">
              <button
                aria-selected={!isCsvTab}
                className={`intake-tab ${!isCsvTab ? "intake-tab-active" : ""}`}
                onClick={() => setActiveTab("manual")}
                role="tab"
                type="button"
              >
                Manual entry
              </button>
              <button
                aria-selected={isCsvTab}
                className={`intake-tab ${isCsvTab ? "intake-tab-active" : ""}`}
                onClick={() => setActiveTab("csv")}
                role="tab"
                type="button"
              >
                CSV upload
                {hasCsvUpload ? ` (${csvUpload.records.length})` : ""}
              </button>
            </div>

            {processingStatus ? (
              <div className="status-banner status-info">
                <strong>
                  {processingStatus.mode === "csv" ? "Processing CSV" : "Processing manual batch"}: chunk{" "}
                  {processingStatus.currentChunk} of {processingStatus.totalChunks}
                </strong>
                <p className="meta-copy">
                  {processingStatus.fileName ? `${processingStatus.fileName} · ` : ""}
                  {processingStatus.processed} of {processingStatus.total} records completed.
                </p>
                <div className="progress-track" role="presentation">
                  <span
                    className="progress-fill"
                    style={{
                      width: `${Math.max(
                        8,
                        Math.round((processingStatus.processed / Math.max(processingStatus.total, 1)) * 100),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {!isCsvTab ? (
              <section className="tab-panel" role="tabpanel">
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
              </section>
            ) : (
              <section className="tab-panel" role="tabpanel">
                <section className="csv-upload-panel">
                  <div className="csv-upload-header">
                    <div>
                      <h3>CSV bulk upload</h3>
                      <p className="helper-copy">
                        Upload the same CSV format used by the legacy runner. Extra columns are ignored, but the required
                        headers must still be present.
                      </p>
                    </div>
                    <div className="csv-upload-actions">
                      <label className="button button-secondary file-picker">
                        <span>{hasCsvUpload ? "Replace CSV" : "Choose CSV"}</span>
                        <input accept=".csv,text/csv" disabled={isSubmitting} onChange={handleCsvUpload} type="file" />
                      </label>
                      {hasCsvUpload ? (
                        <button className="button button-ghost" disabled={isSubmitting} onClick={clearCsvUpload} type="button">
                          Clear CSV
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="meta-copy">Required headers: {currentRequiredFields.join(", ")}</p>

                  {hasCsvUpload ? (
                    <>
                      <div className="csv-upload-summary">
                        <div className="summary-stat">
                          <span>File</span>
                          <strong>{csvUpload.fileName}</strong>
                        </div>
                        <div className="summary-stat">
                          <span>Rows</span>
                          <strong>{csvUpload.records.length}</strong>
                        </div>
                        <div className="summary-stat">
                          <span>Chunks</span>
                          <strong>{Math.ceil(csvUpload.records.length / batchChunkSize)}</strong>
                        </div>
                      </div>

                      <div className="status-banner status-info">
                        CSV mode is active. The floating action button will process {csvUpload.records.length} records from{" "}
                        {csvUpload.fileName}.
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">No CSV loaded yet. Choose a file to process the Salesforce export.</div>
                  )}
                </section>
              </section>
            )}

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
                  {results.meta?.mode === "csv" ? (
                    <p className="meta-copy results-context-copy">
                      {results.meta.fileName} processed in {results.meta.chunkCount} chunk
                      {results.meta.chunkCount === 1 ? "" : "s"} of up to {results.meta.chunkSize} records.
                    </p>
                  ) : null}
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

              {results.meta?.partial ? (
                <div className="status-banner status-error" style={{ marginTop: "18px" }}>
                  Processing stopped after {results.meta.processedCount} of {results.meta.total} records. Review the
                  completed rows below before retrying the remaining CSV records.
                </div>
              ) : null}

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

              {results.summary.failed === 0 && !results.meta?.partial ? (
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
        <button className="button button-floating-ghost" disabled={isSubmitting} type="button" onClick={clearAll}>
          Reset
        </button>
        <button className="button button-floating-primary" type="button" onClick={submitBatch} disabled={isSubmitting}>
          {isSubmitting ? (isCsvTab ? "Processing CSV..." : "Processing batch...") : isCsvTab ? "Process CSV" : "Process batch"}
        </button>
      </div>
    </section>
  );
}
