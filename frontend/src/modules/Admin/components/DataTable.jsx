import { useState, useMemo } from 'react';
import React from 'react';
import { FiChevronLeft, FiChevronRight, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import Button from './Button';

const DataTable = ({
  data = [],
  columns = [],
  pagination = true,
  itemsPerPage = 10,
  sortable = true,
  onRowClick,
  className = '',
  minWidth = 'min-w-[800px]',
  // Server-side pagination: pass these three when `data` is ALREADY just the
  // current page's rows (backend does skip/limit). DataTable then stops
  // re-slicing `data` locally and instead reports page changes upward via
  // onPageChange so the caller can refetch. Without these, DataTable behaves
  // exactly as before: it client-side slices a full in-memory `data` array
  // using its own internal page state.
  serverSide = false,
  page: controlledPage,
  totalItems,
  onPageChange,
}) => {
  const [internalPage, setInternalPage] = useState(1);
  const currentPage = serverSide ? (controlledPage || 1) : internalPage;
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Sorting. In server-side mode this only sorts the current page's rows
  // (there's no full dataset in memory to sort across pages) - the same
  // trade-off most admin tables backed by server pagination make.
  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortable) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortConfig, sortable]);

  // Pagination
  const paginatedData = useMemo(() => {
    if (!pagination || serverSide) return sortedData;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, currentPage, itemsPerPage, pagination, serverSide]);

  const totalResults = serverSide ? (totalItems ?? 0) : sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / itemsPerPage));

  const handleSort = (key) => {
    if (!sortable) return;

    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handlePageChange = (page) => {
    const clamped = Math.max(1, Math.min(page, totalPages));
    if (serverSide) {
      onPageChange?.(clamped);
    } else {
      setInternalPage(clamped);
    }
  };

  // Get primary columns (exclude actions for mobile card view)
  const primaryColumns = columns.filter(col => col.key !== 'actions');
  const actionsColumn = columns.find(col => col.key === 'actions');

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden ${className}`}>
      {/* Mobile Card View - Show on mobile, hide on desktop */}
      <div className="md:hidden">
        {paginatedData.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-500">
            No data available
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {paginatedData.map((row, index) => (
              <div
                key={row.id || index}
                onClick={() => onRowClick && onRowClick(row)}
                className={`p-4 ${
                  onRowClick ? 'cursor-pointer hover:bg-white hover:text-black' : ''
                } transition-colors`}
              >
                <div className="space-y-2.5">
                  {primaryColumns.map((column) => {
                    const rawValue = row[column.key];
                    const value = column.render
                      ? column.render(rawValue, row)
                      : rawValue;
                    
                    // Skip rendering if value is empty/null
                    if (!value && value !== 0) return null;
                    
                    // Ensure value is renderable (not an object/array)
                    let displayValue = value;
                    if (typeof value === 'object' && value !== null && !React.isValidElement(value)) {
                      if (Array.isArray(value)) {
                        displayValue = `${value.length} items`;
                      } else {
                        displayValue = JSON.stringify(value);
                      }
                    }
                    
                    return (
                      <div key={column.key} className="flex items-start gap-2">
                        <span className="text-xs font-semibold text-gray-600 flex-shrink-0 min-w-[80px] sm:min-w-[100px]">
                          {column.label}:
                        </span>
                        <span className="text-sm text-gray-800 break-words flex-1">
                          {displayValue}
                        </span>
                      </div>
                    );
                  })}
                  {actionsColumn && (
                    <div className="pt-2 border-t border-gray-100 mt-3">
                      {actionsColumn.render(null, row)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table View - Hide on mobile, show on desktop */}
      <div className="hidden md:block w-full overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        <table className={`w-full ${minWidth} border-collapse`}>
          <thead className="bg-white border-b border-gray-200">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-3 sm:px-6 py-3 sm:py-4 text-left text-xs font-semibold text-gray-700 uppercase  ${
                    sortable && column.sortable !== false
                      ? 'cursor-pointer hover:bg-gray-100'
                      : ''
                  }`}
                  onClick={() => column.sortable !== false && handleSort(column.key)}
                >
                  <div className="flex items-center gap-2">
                    {column.label}
                    {sortable &&
                      column.sortable !== false &&
                      sortConfig.key === column.key && (
                        <span>
                          {sortConfig.direction === 'asc' ? (
                            <FiChevronUp className="inline" />
                          ) : (
                            <FiChevronDown className="inline" />
                          )}
                        </span>
                      )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 sm:px-6 py-8 sm:py-12 text-center text-gray-500"
                >
                  No data available
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => (
                <tr
                  key={row.id || index}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`${
                    onRowClick ? 'cursor-pointer hover:bg-white hover:text-black' : ''
                  } transition-colors`}
                >
                  {columns.map((column) => {
                    const rawValue = row[column.key];
                    let displayValue = column.render
                      ? column.render(rawValue, row)
                      : rawValue;
                    
                    // Ensure value is renderable (not an object/array)
                    if (typeof displayValue === 'object' && displayValue !== null && !React.isValidElement(displayValue)) {
                      if (Array.isArray(displayValue)) {
                        displayValue = `${displayValue.length} items`;
                      } else {
                        displayValue = JSON.stringify(displayValue);
                      }
                    }
                    
                    return (
                      <td
                        key={column.key}
                        className="px-3 sm:px-6 py-3 sm:py-4 whitespace-normal break-words text-sm text-gray-700"
                      >
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div className="bg-white px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 border-t border-gray-200">
          <div className="text-xs sm:text-sm text-gray-700">
            Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
            {Math.min(currentPage * itemsPerPage, totalResults)} of{' '}
            {totalResults} results
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              variant="secondary"
              icon={FiChevronLeft}
            />
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, index) => {
                const page = index + 1;
                // Show first, last, current, and adjacent pages
                if (
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
                ) {
                  return (
                    <Button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      variant={currentPage === page ? 'primary' : 'ghost'}
                      size="sm"
                      className={currentPage === page ? '' : 'text-gray-700'}
                    >
                      {page}
                    </Button>
                  );
                } else if (
                  page === currentPage - 2 ||
                  page === currentPage + 2
                ) {
                  return <span key={page} className="px-1">...</span>;
                }
                return null;
              })}
            </div>
            <Button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              variant="secondary"
              icon={FiChevronRight}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;

