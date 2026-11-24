import { Box, Card, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import type { PageMeta } from '@/api/adminTypes';
import { EmptyState, ErrorState } from '@/components/common/States';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  sortKey?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
}

interface Props<T> {
  columns: Column<T>[];
  rows?: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: ReactNode;
  meta?: PageMeta;
  onPageChange?: (page: number, pageSize: number) => void;
  sort?: { key?: string; order: 'asc' | 'desc' };
  onSortChange?: (key: string, order: 'asc' | 'desc') => void;
  onRowClick?: (row: T) => void;
  toolbar?: ReactNode;
  plain?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, emptyTitle = 'Nothing here yet', emptyText, emptyAction, meta, onPageChange, sort, onSortChange, onRowClick, toolbar, plain }: Props<T>) {
  const theme = useTheme();
  const display = (c: Column<T>) => (c.hideBelow ? { xs: 'none', [c.hideBelow]: 'table-cell' } : undefined);

  const body = () => {
    if (loading && !rows) {
      return Array.from({ length: 6 }, (_, i) => (
        <TableRow key={i}>
          {columns.map((c) => (
            <TableCell key={c.key} sx={{ display: display(c) }}>
              <Skeleton variant="text" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }
    return rows!.map((row) => (
      <TableRow
        key={rowKey(row)}
        hover
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        sx={{ cursor: onRowClick ? 'pointer' : undefined, '&:last-child td': { borderBottom: 0 } }}
      >
        {columns.map((c) => (
          <TableCell key={c.key} align={c.align} sx={{ display: display(c) }}>
            {c.render(row)}
          </TableCell>
        ))}
      </TableRow>
    ));
  };

  const content = (
    <>
      {toolbar}
      {error ? (
        <ErrorState message={error} onRetry={onRetry} compact />
      ) : rows && rows.length === 0 && !loading ? (
        <EmptyState compact title={emptyTitle} description={emptyText} action={emptyAction} />
      ) : (
        <TableContainer sx={{ opacity: loading && rows ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Table size="medium">
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c.key} align={c.align} sx={{ width: c.width, whiteSpace: 'nowrap', display: display(c) }}>
                    {c.sortKey && onSortChange ? (
                      <TableSortLabel
                        active={sort?.key === c.sortKey}
                        direction={sort?.key === c.sortKey ? sort.order : 'asc'}
                        onClick={() => onSortChange(c.sortKey!, sort?.key === c.sortKey && sort?.order === 'asc' ? 'desc' : 'asc')}
                      >
                        {c.header}
                      </TableSortLabel>
                    ) : (
                      c.header
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>{body()}</TableBody>
          </Table>
        </TableContainer>
      )}
      {meta && onPageChange && meta.total > 0 && (
        <TablePagination
          component="div"
          count={meta.total}
          page={meta.page - 1}
          rowsPerPage={meta.pageSize}
          rowsPerPageOptions={[10, 25, 50, 100]}
          onPageChange={(_, p) => onPageChange(p + 1, meta.pageSize)}
          onRowsPerPageChange={(e) => onPageChange(1, Number(e.target.value))}
          sx={{ borderTop: `1px dashed ${alpha(theme.palette.text.secondary, 0.2)}` }}
        />
      )}
    </>
  );

  return plain ? <Box>{content}</Box> : <Card>{content}</Card>;
}
