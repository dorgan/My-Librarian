<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Create account · My Librarian</title>
    @if (file_exists(public_path('build/manifest.json')) || file_exists(public_path('hot')))
        @vite(['resources/css/app.css'])
    @endif
</head>

<body>
    <main class="auth-shell">
        <section class="auth-card">
            <h1>Create your library account</h1>
            <p>Use your email to sign up. We will send a secure magic link for first-time login and email verification.</p>

            @if (session('status'))
                <p class="auth-status">{{ session('status') }}</p>
            @endif

            @if ($errors->any())
                <p class="auth-error">{{ $errors->first() }}</p>
            @endif

            <form method="POST" action="{{ route('register.store') }}" class="stacked-form">
                @csrf
                <label>Email
                    <input name="email" type="email" required autocomplete="email" value="{{ old('email') }}">
                </label>
                <button type="submit">Send magic link</button>
            </form>

            <p class="auth-switch">Already have an account? <a href="{{ route('login') }}">Sign in</a>.</p>
        </section>
    </main>
</body>

</html>
