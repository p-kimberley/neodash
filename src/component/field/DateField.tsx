import React from 'react';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';

const MAX_DATE = dayjs('9999-12-31');

/** A YYYY-MM-DD date field with a calendar; `value` and `onChange` use Day.js dates (or null). */
const NeoDatePicker = ({ label, value, onChange, disabled = false }) => {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DesktopDatePicker
        label={label}
        format='YYYY-MM-DD'
        value={value}
        disabled={disabled}
        onChange={(newValue) => onChange(newValue)}
        maxDate={MAX_DATE}
        slotProps={{
          textField: {
            variant: 'outlined',
            style: { width: 'calc(100% - 30px)', marginLeft: '15px', marginTop: '5px' },
          },
        }}
      />
    </LocalizationProvider>
  );
};

export default NeoDatePicker;
