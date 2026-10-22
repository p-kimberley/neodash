import React from 'react';
import { DatePicker } from '@neo4j-ndl/react';

const MAX_DATE = new Date(9999, 11, 31);

/**
 * A date field with a calendar, showing YYYY-MM-DD; dates can also be typed as YYYYMMDD. `value` and
 * `onChange` use JavaScript dates (local midnight), or null when the field is empty.
 */
const NeoDatePicker = ({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  disabled?: boolean;
}) => {
  return (
    <div style={{ width: 'calc(100% - 30px)', marginLeft: '15px', marginTop: '5px' }}>
      <DatePicker
        isClearable
        isDisabled={disabled}
        reactDatePickerProps={{
          selected: value,
          onChange: (date) => onChange(date ?? null),
          dateFormat: ['yyyy-MM-dd', 'yyyyMMdd'],
          placeholderText: 'YYYY-MM-DD',
          maxDate: MAX_DATE,
          popperProps: { strategy: 'fixed' },
        }}
        textInputProps={{
          label: label || undefined,
          isFluid: true,
          htmlAttributes: { 'aria-label': label || 'Date' },
        }}
      />
    </div>
  );
};

export default NeoDatePicker;
