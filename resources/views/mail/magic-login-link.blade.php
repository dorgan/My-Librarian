<!doctype html>
<html lang="en">

<body style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.5;">
    <h1 style="font-size: 1.1rem;">My Librarian secure sign-in</h1>
    <p>Use the button below to {{ $context === 'register' ? 'finish setting up your account' : 'sign in' }}.</p>
    <p><a href="{{ $magicLink }}" style="display:inline-block;padding:10px 16px;background:#111827;color:white;text-decoration:none;border-radius:8px;">Continue with magic link</a></p>
    <p>This link expires at {{ \Illuminate\Support\Carbon::instance($expiresAt)->toDayDateTimeString() }}.</p>
    <p>If you did not request this email, you can safely ignore it.</p>
</body>

</html>
