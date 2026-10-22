import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface ComboOption { value: string; label: string; hint?: string }

/** Accessible searchable select (keyboard: type to filter, ↑/↓, Enter). */
export function Combobox({
  id, value, options, onChange, placeholder = 'Select…', searchPlaceholder = 'Search…', invalid, describedBy, disabled,
}: {
  id: string; value: string; options: readonly ComboOption[]; onChange: (value: string) => void;
  placeholder?: string; searchPlaceholder?: string; invalid?: boolean; describedBy?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-3 text-left text-sm shadow-[inset_0_1px_1px_rgb(16_24_40/0.03)] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-canvas disabled:text-ink-3',
            invalid && 'border-danger',
            !selected && 'text-ink-3',
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[240px] rounded-md border border-line bg-surface shadow-lg"
        >
          <Command loop>
            <Command.Input
              placeholder={searchPlaceholder}
              className="h-9 w-full border-b border-line bg-transparent px-3 text-sm outline-none placeholder:text-ink-3"
            />
            <Command.List className="max-h-64 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-4 text-center text-sm text-ink-3">No matches.</Command.Empty>
              {options.map((o) => (
                <Command.Item
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => { onChange(o.value); setOpen(false); }}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink data-[selected=true]:bg-accent-soft"
                >
                  <Check className={cn('h-3.5 w-3.5 text-accent', o.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-ink-3">{o.hint}</span>}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
