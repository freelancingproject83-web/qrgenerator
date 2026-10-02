import { useState, type FormEvent } from 'react';
import { batchSchema, type Batch } from '@qrgenerator/contracts';
import { PointList } from '../components/forms/PointList';
import { Field } from '../components/ui/Field';
import { PageHead } from '../components/ui/PageHead';
import { failureMessage, type AuthenticatedRequest } from '../lib/api';

const listFields = [
  ['cautions', 'Cautions', 'Keep away from children'],
  ['variants', 'Available variants / strengths', 'Paracetamol 500 mg tablet'],
  ['usages', 'Usages', 'Temporary relief of fever'],
  [
    'dosages',
    'Dosage guidance',
    'Use only as directed by a qualified professional',
  ],
  ['eligibleUsers', 'Who can use it', 'Adults when medically appropriate'],
  ['sideEffects', 'Possible side effects', 'Nausea or allergic reaction'],
] as const;

export default function CreateBatchPage({
  authenticated,
  onCreated,
}: {
  authenticated: AuthenticatedRequest;
  onCreated: (batch: Batch) => void;
}) {
  const [fields, setFields] = useState({
    medicineName: '',
    medicineType: '',
    manufactureDate: '',
    expiryDate: '',
    cautions: [''],
    variants: [''],
    usages: [''],
    dosages: [''],
    eligibleUsers: [''],
    sideEffects: [''],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...fields,
        ...Object.fromEntries(
          listFields.map(([key]) => [
            key,
            fields[key].map((value) => value.trim()).filter(Boolean),
          ]),
        ),
      };
      const response = await authenticated('/batches', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await failureMessage(response));
      onCreated(
        batchSchema.parse(
          ((await response.json()) as { batch: unknown }).batch,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not create batch',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Step 1 of 2"
        title="Create a medicine batch"
        description="Record the medicine profile first. A collision-proof batch number is assigned only after validation."
      />
      <form className="panel medicine-form" onSubmit={submit}>
        <div className="form-section">
          <div className="section-number">01</div>
          <div className="section-copy">
            <h2>Medicine identity</h2>
            <p>
              The name and type form a friendly slug; the generated batch number
              remains the only database identity.
            </p>
          </div>
          <div className="form-fields two">
            <Field label="Medicine name">
              <input
                required
                minLength={2}
                maxLength={160}
                value={fields.medicineName}
                onChange={(event) =>
                  setFields({ ...fields, medicineName: event.target.value })
                }
                placeholder="e.g. Calpol"
              />
            </Field>
            <Field label="Type of medicine">
              <input
                required
                minLength={2}
                maxLength={120}
                value={fields.medicineType}
                onChange={(event) =>
                  setFields({ ...fields, medicineType: event.target.value })
                }
                placeholder="e.g. Paracetamol tablet"
              />
            </Field>
          </div>
        </div>

        <div className="form-section">
          <div className="section-number">02</div>
          <div className="section-copy">
            <h2>Lifecycle dates</h2>
            <p>Expiry must be later than manufacture date.</p>
          </div>
          <div className="form-fields two">
            <Field label="Manufacture date">
              <input
                required
                type="date"
                value={fields.manufactureDate}
                onChange={(event) =>
                  setFields({ ...fields, manufactureDate: event.target.value })
                }
              />
            </Field>
            <Field label="Date of expiry">
              <input
                required
                type="date"
                min={fields.manufactureDate || undefined}
                value={fields.expiryDate}
                onChange={(event) =>
                  setFields({ ...fields, expiryDate: event.target.value })
                }
              />
            </Field>
          </div>
        </div>

        <div className="form-section">
          <div className="section-number">03</div>
          <div className="section-copy">
            <h2>Clinical information</h2>
            <p>
              Add one clear point per row. Every section requires at least one
              point.
            </p>
          </div>
          <div className="list-fields">
            {listFields.map(([key, label, placeholder]) => (
              <PointList
                key={key}
                label={label}
                placeholder={placeholder}
                values={fields[key]}
                onChange={(values) => setFields({ ...fields, [key]: values })}
              />
            ))}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="form-footer">
          <p>
            The batch number is server generated and protected by a database
            primary key.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? 'Creating batch…' : 'Create batch & continue →'}
          </button>
        </div>
      </form>
    </>
  );
}
