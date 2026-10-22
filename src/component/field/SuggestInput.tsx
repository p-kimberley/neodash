import React, { useId, useMemo, useState } from 'react';
import { Popover, TextInput } from '@neo4j-ndl/react';

/**
 * A text field with suggestions: what is typed is the value, and matching suggestions (e.g. field or
 * property names) are offered below it to pick from with the mouse or the arrow keys and Enter.
 * Escape closes the list. Suggestions match case-insensitively anywhere in the text.
 *
 * By default a picked suggestion becomes the value like typed text does; with `onPick`, typing only
 * searches (e.g. for suggestions from the database) and picking sets the value.
 */
export const SuggestInput = ({
  value,
  onChange,
  onPick,
  onBlur,
  suggestions,
  placeholder,
  label,
  ariaLabel,
  className,
  style,
  isDisabled = false,
  isFluid = true,
  size = 'small',
}: {
  value: string;
  onChange: (value: string) => void;
  onPick?: (value: string) => void;
  onBlur?: () => void;
  suggestions: string[];
  placeholder?: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  isDisabled?: boolean;
  isFluid?: boolean;
  size?: 'large' | 'medium' | 'small';
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const text = (value ?? '').toLowerCase();
    const unique = [...new Set(suggestions.filter((s) => s !== undefined && s !== null).map((s) => `${s}`))];
    // The exact value on its own isn't worth offering.
    return unique.filter((s) => s.toLowerCase().includes(text) && s !== value);
  }, [suggestions, value]);
  const open = isOpen && matches.length > 0 && !isDisabled;

  const pick = (suggestion: string) => {
    (onPick ?? onChange)(suggestion);
    setIsOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      if (matches.length > 0) {
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + matches.length) % matches.length);
      }
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape' && open) {
      // Close the list, not the dialog around it.
      e.stopPropagation();
      setIsOpen(false);
    }
  };

  return (
    <div ref={setAnchor} className={`nd-suggest-input ${className ?? ''}`} style={style}>
      <TextInput
        label={label}
        size={size}
        isFluid={isFluid}
        isDisabled={isDisabled}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setActive(-1);
        }}
        htmlAttributes={{
          'aria-label': ariaLabel ?? (typeof label === 'string' ? undefined : placeholder),
          role: 'combobox',
          'aria-autocomplete': 'list',
          'aria-expanded': open,
          'aria-controls': listId,
          'aria-activedescendant': open && active >= 0 ? `${listId}-${active}` : undefined,
          autoComplete: 'off',
          spellCheck: false,
          onFocus: () => setIsOpen(true),
          onBlur: () => {
            setIsOpen(false);
            onBlur?.();
          },
          onKeyDown,
        }}
      />
      <Popover
        isOpen={open}
        onOpenChange={(next) => !next && setIsOpen(false)}
        anchorElement={anchor}
        placement='bottom-start-top-start'
        offset={4}
        // Focus stays in the text field.
        initialFocus={-1}
      >
        <Popover.Content className='nd-suggest-list' htmlAttributes={{ id: listId, role: 'listbox' }}>
          {matches.map((suggestion, i) => (
            <div
              key={suggestion}
              id={`${listId}-${i}`}
              role='option'
              aria-selected={i === active}
              className={`nd-suggest-option ${i === active ? 'is-active' : ''}`}
              // Mouse-down, before the text field's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(suggestion);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {suggestion}
            </div>
          ))}
        </Popover.Content>
      </Popover>
    </div>
  );
};

export default SuggestInput;
