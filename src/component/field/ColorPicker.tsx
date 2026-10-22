import React, { useState } from 'react';
import { ColorPicker, Popover } from '@neo4j-ndl/react';
import chroma from 'chroma-js';

/** The picker's RGBA value for any CSS colour (names, hex, rgb/rgba, hsl); grey if it can't be parsed.
 * The picker has no transparency control: a colour's transparency is kept as it is. */
const toRgba = (color?: string) => {
  const [r, g, b, a] = color && chroma.valid(color) ? chroma(color).rgba() : [128, 128, 128, 1];
  return { r, g, b, a };
};

/** Picked colours are saved as hex, or as rgba() when transparent (as the previous picker did). */
const fromRgba = ({ r, g, b, a }: { r: number; g: number; b: number; a: number }) =>
  a < 1 ? `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})` : chroma(r, g, b).hex();

/**
 * Colour setting: a swatch that opens the design system's colour picker, next to a text field that
 * takes any CSS colour (including transparent rgba() values). Values are stored as CSS colour strings,
 * so settings saved with the previous pickers keep working.
 */
const NeoColorPicker = ({ value, onChange, defaultValue, label, style }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [swatch, setSwatch] = useState<HTMLButtonElement | null>(null);
  const current = value ?? defaultValue ?? '';
  return (
    <div style={style}>
      <div className='ndl-form-item ndl-type-text ndl-small'>
        <label htmlFor={label} className='ndl-form-item-label ndl-fluid'>
          <div className='ndl-input-wrapper nd-color-field'>
            <button
              ref={setSwatch}
              type='button'
              className='nd-color-swatch'
              aria-label={`Pick ${label || 'colour'}`}
              aria-haspopup='dialog'
              aria-expanded={isOpen}
              // Painted over a checkerboard (components.css), so transparency shows.
              style={{ '--nd-swatch': current || 'transparent' } as React.CSSProperties}
              onClick={() => setIsOpen((open) => !open)}
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
      {/* Outside the label, so clicks in the picker don't focus the text field (and close it). */}
      <Popover isOpen={isOpen} onOpenChange={setIsOpen} anchorElement={swatch} placement='bottom-start-top-start'>
        <Popover.Content className='nd-color-popover'>
          <ColorPicker color={toRgba(current)} onChange={({ rgb }) => onChange(fromRgba(rgb))} />
        </Popover.Content>
      </Popover>
    </div>
  );
};

export default NeoColorPicker;
