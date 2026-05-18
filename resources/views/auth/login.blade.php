<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in · My Librarian</title>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
        @vite(['resources/css/app.css'])
    @endif
</head>

<body>
    <main class="auth-shell">
        <section class="auth-card">
            <h1>Sign in to My Librarian</h1>
            <p>Use your passkey when available, or request a magic link fallback.</p>

            @if (session('status'))
                <p class="auth-status">{{ session('status') }}</p>
            @endif

            @if ($errors->any())
                <p class="auth-error">{{ $errors->first() }}</p>
            @endif

            <form id="passkey-login-form" class="stacked-form" novalidate>
                <label>Email
                    <input id="passkey-email" type="email" required autocomplete="email" value="{{ old('email') }}">
                </label>
                <button type="submit" class="secondary-btn">Continue with passkey</button>
            </form>

            <form method="POST" action="{{ route('login.magic-link') }}" class="stacked-form auth-divider">
                @csrf
                <label>Email
                    <input name="email" type="email" required autocomplete="email" value="{{ old('email') }}">
                </label>
                <button type="submit">Email me a magic link</button>
            </form>

            <p id="passkey-feedback" class="hint" aria-live="polite"></p>
            <p class="auth-switch">Need an account? <a href="{{ route('register') }}">Sign up</a>.</p>
        </section>
    </main>

    <script>
        const passkeyFeedback = document.getElementById('passkey-feedback');
        const passkeyForm = document.getElementById('passkey-login-form');
        const passkeyEmail = document.getElementById('passkey-email');
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

        const toBase64Url = (bytes) => {
            const binary = String.fromCharCode(...new Uint8Array(bytes));
            return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        };

        passkeyForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            passkeyFeedback.textContent = 'Checking for passkeys…';

            try {
                const optionsResponse = await fetch('{{ route('login.passkey.options') }}', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({ email: passkeyEmail.value }),
                });

                if (!optionsResponse.ok) {
                    throw new Error('No passkey available.');
                }

                const options = await optionsResponse.json();
                const assertion = await navigator.credentials.get({
                    publicKey: {
                        challenge: new Uint8Array(options.challenge),
                        rpId: options.rpId,
                        allowCredentials: options.allowCredentials.map((credential) => ({
                            ...credential,
                            id: new Uint8Array(credential.id),
                        })),
                        userVerification: options.userVerification,
                        timeout: options.timeout,
                    },
                });

                if (!assertion) {
                    throw new Error('Passkey was not provided.');
                }

                const verifyResponse = await fetch('{{ route('login.passkey.verify') }}', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        id: assertion.id,
                        response: {
                            clientDataJSON: toBase64Url(assertion.response.clientDataJSON),
                            authenticatorData: toBase64Url(assertion.response.authenticatorData),
                            signature: toBase64Url(assertion.response.signature),
                        },
                    }),
                });

                if (!verifyResponse.ok) {
                    throw new Error('Passkey verification failed.');
                }

                const payload = await verifyResponse.json();
                window.location.assign(payload.redirect || '/');
            } catch (error) {
                passkeyFeedback.textContent = 'Passkey sign-in is unavailable for that account. Use your magic link below.';
            }
        });
    </script>
</body>

</html>
