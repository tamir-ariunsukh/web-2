import { queryString } from '../api.js';
import { signIn, signUp, session } from '../session.js';
import { escapeHtml } from '../util.js';

/** Sign in and register, sharing one form layout. */

export async function renderLogin(view) {
  if (session.user) {
    window.history.replaceState({}, '', '/');
    void import('../app.js').then((app) => app.render());
    return;
  }
  view.innerHTML = authCard('login');
  wire(view, 'login');
}

export async function renderRegister(view) {
  if (session.user) {
    window.history.replaceState({}, '', '/');
    void import('../app.js').then((app) => app.render());
    return;
  }
  view.innerHTML = authCard('register');
  wire(view, 'register');
}

function authCard(mode) {
  const isRegister = mode === 'register';

  return `
    <div class="container container-narrow">
      <div class="card"><div class="card-body stack">
        <h1 class="page-title">${isRegister ? 'Create your account' : 'Sign in'}</h1>

        <form id="auth-form" class="stack" novalidate>
          ${
            isRegister
              ? `<div class="grid-2">
                   <label class="field"><span class="label">First name</span>
                     <input class="input" name="firstName" required autocomplete="given-name" placeholder="Bat" /></label>
                   <label class="field"><span class="label">Last name</span>
                     <input class="input" name="lastName" required autocomplete="family-name" placeholder="Erdene" /></label>
                 </div>`
              : ''
          }

          <label class="field"><span class="label">Email</span>
            <input class="input" name="email" type="email" required autocomplete="email" placeholder="you@example.com" /></label>

          <label class="field">
            <span class="label">Password</span>
            <input class="input" name="password" type="password" required
              ${isRegister ? 'minlength="12"' : ''}
              autocomplete="${isRegister ? 'new-password' : 'current-password'}" placeholder="••••••••••••" />
            ${isRegister ? '<span class="hint">At least 12 characters</span>' : ''}
          </label>

          ${
            isRegister
              ? `<label class="field"><span class="label">Phone</span>
                   <input class="input" name="phone" type="tel" autocomplete="tel" placeholder="+976 9900 1122" />
                   <span class="hint">Optional</span></label>`
              : ''
          }

          <p class="alert error" data-role="error" hidden></p>
          <button class="btn" type="submit" style="justify-self:start">${
            isRegister ? 'Create account' : 'Sign in'
          }</button>
        </form>

        <p class="small muted">
          ${
            isRegister
              ? `Already registered? <a href="/login" data-link>Sign in</a>`
              : `New here? <a href="/register" data-link>Create an account</a>`
          }
        </p>
      </div></div>
    </div>
  `;
}

function wire(view, mode) {
  const form = view.querySelector('#auth-form');
  const error = view.querySelector('[data-role="error"]');
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;

    const data = new FormData(form);
    const values = Object.fromEntries(data.entries());

    if (mode === 'register' && String(values.password ?? '').length < 12) {
      error.textContent = 'Password must be at least 12 characters';
      error.hidden = false;
      return;
    }

    submit.classList.add('loading');
    submit.disabled = true;

    try {
      if (mode === 'register') {
        await signUp({
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          ...(values.phone ? { phone: values.phone } : {}),
        });
      } else {
        await signIn(values.email, values.password);
      }

      const app = await import('../app.js');
      app.navigate('/');
    } catch (thrown) {
      error.textContent = messageFor(mode, thrown);
      error.hidden = false;
    } finally {
      submit.classList.remove('loading');
      submit.disabled = false;
    }
  });
}

function messageFor(mode, error) {
  switch (error?.code) {
    case 'EMAIL_ALREADY_REGISTERED':
      return 'An account with this email already exists';
    case 'INVALID_CREDENTIALS':
      return mode === 'register' ? 'Email or password is incorrect' : 'Email or password is incorrect';
    case 'ACCOUNT_LOCKED':
      return 'Too many failed attempts. Try again later.';
    case 'VALIDATION_FAILED':
      return error.message;
    case 'NETWORK':
      return 'Could not reach the server. Is the API running?';
    default:
      return error?.message ?? 'Something went wrong. Please try again.';
  }
}

void queryString;
void escapeHtml;
