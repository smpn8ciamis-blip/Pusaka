import { useVirtualizer } from '@tanstack/react-virtual';
import { TableBody } from '@/components/ui/table';
import { ReactNode, useRef, memo } from 'react';

interface VirtualTableBodyProps {
  height: number;
  itemSize: number;
  itemCount: number;
  renderRow: (index: number) => ReactNode;
  overscanCount?: number;
}

export const VirtualTableBody = memo(({
  height,
  itemSize,
  itemCount,
  renderRow,
  overscanCount = 5,
}: VirtualTableBodyProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemSize,
    overscan: overscanCount,
  });

  if (itemCount === 0) {
    return <TableBody>{renderRow(0)}</TableBody>;
  }

  return (
    <TableBody>
      <tr>
        <td colSpan={100} style={{ padding: 0, border: 'none' }}>
          <div
            ref={parentRef}
            style={{
              height: `${height}px`,
              overflow: 'auto',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderRow(virtualRow.index)}
                </div>
              ))}
            </div>
          </div>
        </td>
      </tr>
    </TableBody>
  );
});

VirtualTableBody.displayName = 'VirtualTableBody';
