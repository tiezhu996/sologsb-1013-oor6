import { helper } from '@ember/component/helper';

export function formatTime(
  value: string | undefined | null,
  compact = false,
): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (part: number) => String(part).padStart(2, '0');
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (compact) return clock;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

interface FormatTimeSignature {
  Args: { Positional: [value: string | undefined | null, compact?: boolean] };
  Return: string;
}

export default helper<FormatTimeSignature>(([value, compact]) =>
  formatTime(value, compact),
);
