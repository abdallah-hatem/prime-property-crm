'use client';

import { useEffect, useRef, useState } from 'react';

/** Shows the live value of a CSS colour token as resolved inside its palette column. */
export function SwatchValue({ token }: { token: string }) {
  const ref = useRef<HTMLElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!ref.current) return;
    setValue(
      getComputedStyle(ref.current).getPropertyValue(`--${token}`).trim(),
    );
  }, [token]);

  return (
    <code
      ref={ref}
      className="px-2.5 pb-2 text-[11px] leading-tight text-muted-foreground"
    >
      {value}
    </code>
  );
}
