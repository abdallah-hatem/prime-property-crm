import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/i18n-provider';
import { ThemeProvider } from './theme-provider';
import { ThemeToggle } from './theme-toggle';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function renderToggle(locale: 'en' | 'ar' = 'en') {
  return render(
    <ThemeProvider>
      <I18nProvider locale={locale}>
        <ThemeToggle />
      </I18nProvider>
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  it('switches the page to dark and back to light', async () => {
    const user = userEvent.setup();
    renderToggle();
    const html = document.documentElement;

    await user.click(screen.getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(html).toHaveClass('dark'));
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Light' }));
    await waitFor(() => expect(html).toHaveClass('light'));
    expect(html).not.toHaveClass('dark');
  });

  it('remembers the choice for the next visit', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    await waitFor(() =>
      expect(window.localStorage.getItem('theme')).toBe('dark'),
    );
  });

  it('follows the system preference when System is chosen', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('button', { name: 'Dark' }));
    await user.click(screen.getByRole('button', { name: 'System' }));
    // matchMedia reports light in the test environment.
    await waitFor(() => expect(document.documentElement).toHaveClass('light'));
  });

  it('works in Arabic', async () => {
    const user = userEvent.setup();
    renderToggle('ar');
    expect(screen.getByRole('group', { name: 'المظهر' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'داكن' }));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });
});
