import React, { useState } from 'react';
import { Popover } from '@mui/material';
import { RgbaColorPicker } from 'react-colorful';
import chroma from 'chroma-js';

/** The picker's RGBA value for any CSS colour (names, hex, rgb/rgba, hsl); grey if it can't be parsed. */
const toRgba = (color?: string) => {
  const [r, g, b, a] = color && chroma.valid(color) ? chroma(color).rgba() : [128, 128, 128, 1];
  return { r, g, b, a };
};

/** Picked colours are saved as hex, or as rgba() when transparent (as the previous picker did). */
const fromRgba = ({ r, g, b, a }: { r: number; g: number; b: number; a: number }) =>
  a < 1 ? `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})` : chroma(r, g, b).hex();

/**
 * Colour setting: a swatch that opens a picker, next to a text field that takes any CSS colour.
 * Values are stored as CSS colour strings, so settings saved with the previous picker (mui-color)
 * keep working.
 */
const NeoColorPicker = ({ value, onChange, defaultValue, label, style }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = value ?? defaultValue ?? '';
  return (
    <div style={style}>
      <div className='ndl-form-item ndl-type-text ndl-small'>
        <label htmlFor={label} className='ndl-form-item-label ndl-fluid'>
          <div className='ndl-input-wrapper nd-color-field'>
            <button
              type='button'
              className='nd-color-swatch'
              aria-label={`Pick ${label || 'colour'}`}
              // Painted over a checkerboard (components.css), so transparency shows.
              style={{ '--nd-swatch': current || 'transparent' } as React.CSSProperties}
              onClick={(e) => setAnchor(e.currentTarget)}
            />
            <input
              id={label}
              className='ndl-input'
              value={current}
              spellCheck={false}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
          <div className='ndl-form-item-wrapper'>
            <span className='ndl-form-label-text'>{label}</span>
          </div>
        </label>
      </div>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        PaperProps={{ className: 'nd-color-popover' }}
      >
        <RgbaColorPicker color={toRgba(current)} onChange={(rgba) => onChange(fromRgba(rgba))} />
      </Popover>
    </div>
  );
};

export default NeoColorPicker;
