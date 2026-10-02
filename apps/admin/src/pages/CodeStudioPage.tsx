import { useMemo, useState } from 'react';
import {
  codeJobResponseSchema,
  codePreviewResponseSchema,
  type Batch,
  type CodeJobResponse,
  type CodePreviewResponse,
  type CodePrintOptions,
} from '@qrgenerator/contracts';
import { Field } from '../components/ui/Field';
import { PageHead } from '../components/ui/PageHead';
import { failureMessage, type AuthenticatedRequest } from '../lib/api';

export default function CodeStudioPage({
  batch,
  authenticated,
}: {
  batch: Batch;
  authenticated: AuthenticatedRequest;
}) {
  const [format, setFormat] = useState<'qr' | 'data_matrix'>('qr');
  const [quantity, setQuantity] = useState(1);
  const [moduleSizeMm, setModuleSizeMm] = useState(0.25);
  const [printerDpi, setPrinterDpi] = useState(600);
  const [errorCorrection, setErrorCorrection] = useState<'M' | 'Q' | 'H'>('M');
  const [preview, setPreview] = useState<CodePreviewResponse>();
  const [job, setJob] = useState<CodeJobResponse>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const print = useMemo<CodePrintOptions>(
    () =>
      format === 'qr'
        ? {
            format,
            moduleSizeMm,
            printerDpi,
            printMode: 'standard',
            errorCorrection,
          }
        : { format, moduleSizeMm, printerDpi, printMode: 'standard' },
    [errorCorrection, format, moduleSizeMm, printerDpi],
  );

  async function run(action: 'preview' | 'issue') {
    setBusy(action);
    setError('');
    try {
      const response = await authenticated(
        action === 'preview' ? '/code-jobs/preview' : '/code-jobs',
        {
          method: 'POST',
          headers:
            action === 'issue'
              ? { 'Idempotency-Key': crypto.randomUUID() }
              : {},
          body: JSON.stringify(
            action === 'preview'
              ? { batchNumber: batch.batchNumber, print }
              : { quantity, batchNumber: batch.batchNumber, print },
          ),
        },
      );
      if (!response.ok) throw new Error(await failureMessage(response));
      if (action === 'preview') {
        setPreview(codePreviewResponseSchema.parse(await response.json()));
      } else {
        setJob(codeJobResponseSchema.parse(await response.json()));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Generation failed');
    } finally {
      setBusy('');
    }
  }

  async function download(id: string, type: 'svg' | 'pdf') {
    setBusy(`${id}-${type}`);
    setError('');
    try {
      const response = await authenticated(`/codes/${id}/artwork.${type}`);
      if (!response.ok) throw new Error(await failureMessage(response));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${batch.batchNumber}-${id}.${type}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Download failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Step 2 of 2 · Code studio"
        title={batch.medicineName}
        description={`${batch.batchNumber} · ${batch.medicineType}`}
      />
      <div className="studio-grid">
        <section className="panel">
          <h2>Identifier settings</h2>
          <div className="format-switch">
            <button
              className={format === 'qr' ? 'active' : ''}
              onClick={() => setFormat('qr')}
            >
              <strong>QR</strong>
              <small>Best native camera support</small>
            </button>
            <button
              className={format === 'data_matrix' ? 'active' : ''}
              onClick={() => setFormat('data_matrix')}
            >
              <strong>Data Matrix</strong>
              <small>Compact ECC200 symbol</small>
            </button>
          </div>
          <div className="form-fields two">
            <Field label="Quantity">
              <input
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(event) => setQuantity(event.target.valueAsNumber)}
              />
            </Field>
            <Field label="Printer DPI">
              <input
                type="number"
                min="200"
                max="2400"
                value={printerDpi}
                onChange={(event) => setPrinterDpi(event.target.valueAsNumber)}
              />
            </Field>
            <Field label="Module size (mm)">
              <input
                type="number"
                min="0.125"
                max="1"
                step="0.025"
                value={moduleSizeMm}
                onChange={(event) =>
                  setModuleSizeMm(event.target.valueAsNumber)
                }
              />
            </Field>
            {format === 'qr' && (
              <Field label="Error correction">
                <select
                  value={errorCorrection}
                  onChange={(event) =>
                    setErrorCorrection(
                      event.target.value as typeof errorCorrection,
                    )
                  }
                >
                  <option value="M">M · compact default</option>
                  <option value="Q">Q · stronger recovery</option>
                  <option value="H">H · maximum recovery</option>
                </select>
              </Field>
            )}
          </div>
          <div className="info-box">
            <strong>Exact printer geometry</strong>
            <p>
              Artwork is rounded up to whole printer dots and independently
              decoded before it can be issued.
            </p>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button
              className="soft"
              disabled={Boolean(busy)}
              onClick={() => void run('preview')}
            >
              {busy === 'preview' ? 'Rendering…' : 'Preview size'}
            </button>
            <button
              className="primary"
              disabled={Boolean(busy)}
              onClick={() => void run('issue')}
            >
              {busy === 'issue'
                ? 'Issuing…'
                : `Issue ${quantity} code${quantity === 1 ? '' : 's'}`}
            </button>
          </div>
        </section>

        <section className="panel preview">
          <h2>Print proof</h2>
          {preview ? (
            <>
              <div
                className="artwork"
                dangerouslySetInnerHTML={{ __html: preview.svg }}
              />
              <div className="proof-size">
                <span>Final artwork</span>
                <strong>
                  {preview.print.totalSizeMm} × {preview.print.totalSizeMm} mm
                </strong>
                <small>
                  {preview.print.dotsPerModule} dots/module ·{' '}
                  {preview.print.actualModuleSizeMm} mm module
                </small>
              </div>
            </>
          ) : (
            <div className="empty compact-empty">
              <span>⌁</span>
              <p>Preview the exact physical size before issuing.</p>
            </div>
          )}
        </section>
      </div>

      {job && (
        <section className="panel issued">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Issued successfully</span>
              <h2>{job.batchNumber}</h2>
            </div>
            <span>
              {job.codes.length} unique code{job.codes.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="issued-grid">
            {job.codes.map((code) => (
              <article key={code.id}>
                <div>
                  <strong>Unit {code.position}</strong>
                  <span className={`badge ${code.status}`}>{code.status}</span>
                </div>
                <a href={code.scanUrl} target="_blank" rel="noreferrer">
                  {code.scanUrl}
                </a>
                <div className="actions">
                  <button
                    className="soft"
                    disabled={Boolean(busy)}
                    onClick={() => void download(code.id, 'svg')}
                  >
                    SVG
                  </button>
                  <button
                    className="soft"
                    disabled={Boolean(busy)}
                    onClick={() => void download(code.id, 'pdf')}
                  >
                    PDF
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
