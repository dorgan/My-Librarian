<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Set up passkey · My Librarian</title>
    <meta name="csrf-token" content="{{ csrf_token() }}">
    @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
        @vite(['resources/css/app.css'])
    @endif
</head>

<body>
    <main class="auth-shell">
        <section class="auth-card">
            <h1>Set up your passkey</h1>
            <p>Your email is verified. Add a passkey for fast future sign-ins on this device.</p>

            <form id="passkey-enroll-form" class="stacked-form">
                <label>Passkey label
                    <input id="passkey-name" maxlength="80" value="Primary device">
                </label>
                <button type="submit">Create passkey</button>
            </form>

            <form method="POST" action="{{ route('onboarding.passkey.skip') }}" class="stacked-form auth-divider">
                @csrf
                <button type="submit" class="secondary-btn">Skip for now</button>
            </form>

            <p id="passkey-feedback" class="hint" aria-live="polite"></p>
        </section>
    </main>

    <script>
        const form = document.getElementById('passkey-enroll-form');
        const feedback = document.getElementById('passkey-feedback');
        const passkeyName = document.getElementById('passkey-name');
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

        const toBase64Url = (bytes) => {
            const binary = String.fromCharCode(...new Uint8Array(bytes));
            return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        };

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            feedback.textContent = 'Preparing secure passkey registration…';

            try {
                const optionsResponse = await fetch('{{ route('passkeys.register.options') }}', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                    },
                    credentials: 'same-origin',
                });

                if (!optionsResponse.ok) {
                    throw new Error('Unable to prepare passkey registration.');
                }

                const options = await optionsResponse.json();
                const credential = await navigator.credentials.create({
                    publicKey: {
                        challenge: new Uint8Array(options.challenge),
                        rp: options.rp,
                        user: {
                            ...options.user,
                            id: new Uint8Array(options.user.id),
                        },
                        pubKeyCredParams: options.pubKeyCredParams,
                        timeout: options.timeout,
                        attestation: options.attestation,
                        authenticatorSelection: options.authenticatorSelection,
                        excludeCredentials: options.excludeCredentials.map((entry) => ({
                            ...entry,
                            id: new Uint8Array(entry.id),
                        })),
                    },
                });

                if (!credential) {
                    throw new Error('No passkey created.');
                }

                const registerResponse = await fetch('{{ route('passkeys.register') }}', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-CSRF-TOKEN': csrfToken,
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        id: credential.id,
                        name: passkeyName.value,
                        response: {
                            clientDataJSON: toBase64Url(credential.response.clientDataJSON),
                            attestationObject: toBase64Url(credential.response.attestationObject),
                            publicKey: credential.response.getPublicKey ? toBase64Url(credential.response.getPublicKey()) : null,
                            transports: credential.response.getTransports ? credential.response.getTransports() : ['internal'],
                        },
                    }),
                });

                if (!registerResponse.ok) {
                    throw new Error('Passkey registration failed.');
                }

                const payload = await registerResponse.json();
                window.location.assign(payload.redirect || '/');
            } catch (error) {
                feedback.textContent = 'Passkey setup failed on this browser. You can skip and continue to your library.';
            }
        });
    </script>
</body>

</html>
