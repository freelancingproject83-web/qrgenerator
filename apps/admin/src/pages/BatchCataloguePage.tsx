import type { Batch } from '@qrgenerator/contracts';
import { PageHead } from '../components/ui/PageHead';

export default function BatchCataloguePage({
  batches,
  canGenerate,
  onCreate,
  onGenerate,
}: {
  batches: Batch[];
  canGenerate: boolean;
  onCreate: () => void;
  onGenerate: (batch: Batch) => void;
}) {
  return (
    <>
      <PageHead
        eyebrow="Batch registry"
        title="Medicine catalogue"
        description="Every identifier begins with a complete, tenant-owned medicine batch record."
        action={
          canGenerate ? (
            <button className="primary" onClick={onCreate}>
              ＋ New medicine batch
            </button>
          ) : undefined
        }
      />
      <section className="stat-grid">
        <Stat label="Total batches" value={batches.length} />
        <Stat
          label="Issued identifiers"
          value={batches.reduce((sum, batch) => sum + batch.codeCount, 0)}
        />
        <Stat
          label="Generation jobs"
          value={batches.reduce((sum, batch) => sum + batch.codeJobCount, 0)}
        />
      </section>
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>All batches</h2>
            <p>
              {canGenerate
                ? 'Select a record to generate identifiers.'
                : 'Read-only access for your tenant.'}
            </p>
          </div>
        </div>
        {batches.length ? (
          <div className="batch-grid">
            {batches.map((batch) => (
              <article className="batch-card" key={batch.batchNumber}>
                <div className="batch-card-top">
                  <span className="medicine-icon">Rx</span>
                  <span className="status-dot">Active</span>
                </div>
                <h3>{batch.medicineName}</h3>
                <p>{batch.medicineType}</p>
                <dl>
                  <div>
                    <dt>Batch number</dt>
                    <dd>{batch.batchNumber}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>
                      {new Date(
                        `${batch.expiryDate}T00:00:00`,
                      ).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt>Codes</dt>
                    <dd>{batch.codeCount}</dd>
                  </div>
                  <div>
                    <dt>Tenant</dt>
                    <dd>{batch.tenantName}</dd>
                  </div>
                </dl>
                {canGenerate && (
                  <button
                    className="soft wide"
                    onClick={() => onGenerate(batch)}
                  >
                    Open code studio →
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <span>◇</span>
            <h3>No batches yet</h3>
            <p>
              {canGenerate
                ? 'Create the first medicine batch to unlock code generation.'
                : 'Your tenant administrator has not created a batch yet.'}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}
