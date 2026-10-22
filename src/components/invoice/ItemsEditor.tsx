import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Textarea } from '@/components/ui/primitives';
import { emptyItem, type FieldErrors, type ItemDraft } from '@/lib/invoice-form';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

export function ItemsEditor({
  items, lineTotals, currency, errors, onChange,
}: {
  items: ItemDraft[]; lineTotals: (bigint | null)[]; currency: string; errors: FieldErrors;
  onChange: (items: ItemDraft[]) => void;
}) {
  const update = (idx: number, patch: Partial<ItemDraft>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, emptyItem()]);

  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_96px_128px_120px_36px] gap-3 px-1 pb-2 text-[12px] font-medium text-ink-3 md:grid">
        <span>Item <span className="text-danger">*</span></span>
        <span>Quantity <span className="text-danger">*</span></span>
        <span>Unit price ({currency}) <span className="text-danger">*</span></span>
        <span className="text-right">Line total <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold uppercase text-accent">Auto</span></span>
        <span />
      </div>
      <ol className="space-y-3">
        {items.map((it, i) => {
          const dErr = errors[`items.${i}.description`];
          const qErr = errors[`items.${i}.quantity`];
          const pErr = errors[`items.${i}.unitPrice`];
          const total = lineTotals[i] ?? null;
          return (
            <li key={it.key} className="rounded-md border border-line p-3 md:border-0 md:p-1">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_96px_128px_120px_36px] md:items-start">
                <div className="col-span-2 md:col-span-1">
                  <label htmlFor={`item-${it.key}-desc`} className="mb-1 block text-[12px] font-medium text-ink-3 md:sr-only">
                    Item {i + 1} description *
                  </label>
                  <Textarea
                    id={`item-${it.key}-desc`}
                    rows={1}
                    className="min-h-9 py-1.5"
                    placeholder="Description of work"
                    value={it.description}
                    aria-invalid={dErr ? true : undefined}
                    aria-describedby={dErr ? `item-${it.key}-desc-err` : undefined}
                    onChange={(e) => update(i, { description: e.target.value })}
                  />
                  {dErr && <p id={`item-${it.key}-desc-err`} className="mt-1 text-[12px] text-danger">{dErr}</p>}
                </div>
                <div>
                  <label htmlFor={`item-${it.key}-qty`} className="mb-1 block text-[12px] font-medium text-ink-3 md:sr-only">Quantity *</label>
                  <Input
                    id={`item-${it.key}-qty`}
                    inputMode="decimal"
                    className="tabular text-right"
                    value={it.quantity}
                    aria-invalid={qErr ? true : undefined}
                    aria-describedby={qErr ? `item-${it.key}-qty-err` : undefined}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                  />
                  {qErr && <p id={`item-${it.key}-qty-err`} className="mt-1 text-[12px] text-danger">{qErr}</p>}
                </div>
                <div>
                  <label htmlFor={`item-${it.key}-price`} className="mb-1 block text-[12px] font-medium text-ink-3 md:sr-only">Unit price *</label>
                  <Input
                    id={`item-${it.key}-price`}
                    inputMode="decimal"
                    className="tabular text-right"
                    placeholder="0.00"
                    value={it.unitPrice}
                    aria-invalid={pErr ? true : undefined}
                    aria-describedby={pErr ? `item-${it.key}-price-err` : undefined}
                    onChange={(e) => update(i, { unitPrice: e.target.value })}
                  />
                  {pErr && <p id={`item-${it.key}-price-err`} className="mt-1 text-[12px] text-danger">{pErr}</p>}
                </div>
                <div className="col-span-1 flex h-9 items-center justify-between md:justify-end">
                  <span className="text-[12px] text-ink-3 md:hidden">Line total</span>
                  <output className={cn('tabular text-sm font-medium', total === null && 'text-ink-3')} aria-label={`Line ${i + 1} total`}>
                    {total === null ? '—' : formatMoney(total, currency)}
                  </output>
                </div>
                <div className="flex h-9 items-center justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove item ${i + 1}`}
                    disabled={items.length === 1}
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {errors.items && <p className="mt-2 text-[12.5px] text-danger" role="alert">{errors.items}</p>}
      <Button className="mt-3" size="sm" onClick={add} disabled={items.length >= 200}>
        <Plus className="h-4 w-4" /> Add item
      </Button>
    </div>
  );
}
