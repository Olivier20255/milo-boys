import * as React from 'react';
import { cn } from '../../lib/utils';

export function DataTable({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60', className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-slate-100 dark:border-slate-800/80 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40',
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-10 px-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap',
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-3 py-2.5 text-sm text-slate-800 dark:text-slate-200 align-middle', className)}
      {...props}
    />
  );
}

export function StatusText({
  tone = 'neutral',
  label,
}: {
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  label: string;
}) {
  const colors = {
    success: 'text-emerald-700 dark:text-emerald-400',
    warning: 'text-amber-700 dark:text-amber-400',
    danger: 'text-red-700 dark:text-red-400',
    info: 'text-blue-700 dark:text-blue-400',
    neutral: 'text-slate-600 dark:text-slate-400',
  };
  return <span className={cn('text-xs font-semibold whitespace-nowrap', colors[tone])}>{label}</span>;
}
