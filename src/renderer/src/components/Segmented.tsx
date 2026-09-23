import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** A row of mutually exclusive options with a clearly highlighted choice. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
