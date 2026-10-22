import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/i18n-provider';
import type { ApiResult } from '@/lib/api-result';
import { LoginForm } from './login-form';

const login = vi.hoisted(() =>
  vi.fn<
    (
      input: unknown,
      next?: string | null,
    ) => Promise<ApiResult<{ redirectTo: string }>>
  >(),
);
vi.mock('@/apis', () => ({ LOGIN: login }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const assign = vi.fn();
beforeEach(() => {
  login.mockReset();
  assign.mockReset();
  Object.defineProperty(window, 'location', {
    value: { assign },
    writable: true,
  });
});

function renderForm(locale: 'en' | 'ar' = 'en', next: string | null = null) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  return render(
    <I18nProvider locale={locale}>
      <LoginForm next={next} />
    </I18nProvider>,
  );
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  clicks = 1,
) {
  await user.type(screen.getByTestId('login-email'), 'sara@prime.test');
  await user.type(screen.getByTestId('login-password'), 'not-the-password');
  for (let i = 0; i < clicks; i++)
    await user.click(screen.getByTestId('login-submit'));
}

describe('LoginForm', () => {
  it('shows the translated message for a wrong password', async () => {
    login.mockResolvedValue({
      success: false,
      status: 401,
      error: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect',
    });
    const user = userEvent.setup();
    renderForm();
    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect.',
    );
    expect(screen.getByTestId('login-submit')).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('shows the too-many-tries message for 429, in Arabic too', async () => {
    login.mockResolvedValue({
      success: false,
      status: 429,
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many failed sign-ins',
    });
    const user = userEvent.setup();
    renderForm('ar');
    await fillAndSubmit(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('محاولات كثيرة');
  });

  it('sends one request however often submit is pressed', async () => {
    let resolve: (value: ApiResult<{ redirectTo: string }>) => void = () => {};
    login.mockImplementation(() => new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderForm('en', '/owners');
    await fillAndSubmit(user, 3);
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('login-submit')).toBeDisabled();
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith(
      { email: 'sara@prime.test', password: 'not-the-password' },
      '/owners',
    );

    resolve({ success: true, status: 200, data: { redirectTo: '/owners' } });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/owners'));
    // Still locked while the browser navigates away.
    expect(screen.getByTestId('login-submit')).toBeDisabled();
  });

  it('blocks submit with translated messages when fields are empty or invalid', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Enter your email.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();

    await user.type(screen.getByTestId('login-email'), 'not-an-email');
    await user.click(screen.getByTestId('login-submit'));
    expect(
      await screen.findByText('Enter a valid email, like name@company.com.'),
    ).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('renders right-to-left in Arabic', () => {
    renderForm('ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(screen.getByLabelText(/البريد الإلكتروني/)).toHaveAttribute(
      'required',
    );
    expect(screen.getByTestId('login-submit')).toHaveTextContent(
      'تسجيل الدخول',
    );
    // The email stays left-to-right inside the RTL page.
    expect(screen.getByTestId('login-email')).toHaveAttribute('dir', 'ltr');
  });
});
