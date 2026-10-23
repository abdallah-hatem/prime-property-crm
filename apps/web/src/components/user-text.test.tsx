import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isolate } from '@/lib/bidi';
import { UserText } from './user-text';

describe('UserText', () => {
  it('isolates an inline run so the surrounding line keeps its direction', () => {
    render(
      <p dir="rtl">
        المالك: <UserText>Call back about the price.</UserText>
      </p>,
    );
    const run = screen.getByText('Call back about the price.');
    expect(run.tagName).toBe('BDI');
  });

  it('lets a block of free text take the direction of its own first letter', () => {
    render(
      <div dir="rtl">
        <UserText as="p">Owner asked for a call after the weekend.</UserText>
      </div>,
    );
    const note = screen.getByText('Owner asked for a call after the weekend.');
    expect(note.tagName).toBe('P');
    expect(note.getAttribute('dir')).toBe('auto');
  });
});

describe('isolate', () => {
  it('wraps typed text in first-strong isolates for use inside a translated sentence', () => {
    expect(isolate('Sara Mahmoud')).toBe('⁨Sara Mahmoud⁩');
  });

  it('leaves an empty value empty', () => {
    expect(isolate('')).toBe('');
  });
});
