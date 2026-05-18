<?php

namespace Tests\Feature;

use App\Mail\MagicLoginLinkMail;
use App\Models\PasskeyCredential;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AuthFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_page_includes_mobile_install_metadata(): void
    {
        $this->get('/login')
            ->assertOk()
            ->assertSee('rel="manifest" href="/manifest.webmanifest"', false)
            ->assertSee('name="apple-mobile-web-app-capable" content="yes"', false)
            ->assertSee('name="mobile-web-app-capable" content="yes"', false);
    }

    public function test_manifest_is_publicly_available_for_home_screen_install(): void
    {
        $response = $this->get('/manifest.webmanifest');

        $response->assertOk();
        $this->assertStringContainsString(
            'application/manifest+json',
            (string) $response->headers->get('content-type')
        );

        $manifestContents = file_get_contents(public_path('manifest.webmanifest'));
        $this->assertIsString($manifestContents);
        $this->assertStringContainsString('"display": "standalone"', $manifestContents);
        $this->assertStringContainsString('"start_url": "/"', $manifestContents);
    }

    public function test_registration_sends_magic_link_email(): void
    {
        Mail::fake();

        $this->post('/register', ['email' => 'new-reader@example.com'])
            ->assertRedirect();

        $this->assertDatabaseHas('users', ['email' => 'new-reader@example.com']);
        Mail::assertSent(MagicLoginLinkMail::class);
    }

    public function test_magic_link_logs_in_and_verifies_email_once(): void
    {
        Mail::fake();

        $this->post('/register', ['email' => 'new-reader@example.com']);

        $magicLink = null;
        Mail::assertSent(MagicLoginLinkMail::class, function (MagicLoginLinkMail $mail) use (&$magicLink): bool {
            $magicLink = $mail->magicLink;

            return str_contains($mail->magicLink, '/auth/magic-link/');
        });

        $this->assertIsString($magicLink);

        $this->get($magicLink)
            ->assertRedirect('/onboarding/passkey');

        $user = User::query()->where('email', 'new-reader@example.com')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh()->email_verified_at);

        $this->post('/logout');

        $this->get($magicLink)
            ->assertRedirect('/login');
    }

    public function test_authenticated_user_can_enroll_passkey(): void
    {
        $user = User::factory()->create([
            'email_verified_at' => now(),
        ]);

        $this->actingAs($user);

        $this->postJson('/auth/passkeys/register/options')
            ->assertOk();

        $challenge = (string) session('passkey.register.challenge');
        $this->assertNotSame('', $challenge);

        $clientData = $this->base64urlEncode((string) json_encode([
            'type' => 'webauthn.create',
            'challenge' => $challenge,
            'origin' => 'http://localhost',
        ]));

        $this->postJson('/auth/passkeys/register', [
            'id' => 'cred-123',
            'name' => 'Primary',
            'response' => [
                'clientDataJSON' => $clientData,
                'attestationObject' => $this->base64urlEncode('attestation'),
                'publicKey' => $this->base64urlEncode('public-key'),
                'transports' => ['internal'],
            ],
        ])->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseHas('passkey_credentials', [
            'user_id' => $user->id,
            'credential_id' => 'cred-123',
        ]);
    }

    public function test_verified_user_can_login_with_passkey_endpoint_flow(): void
    {
        $user = User::factory()->create([
            'email' => 'passkey@example.com',
            'email_verified_at' => now(),
        ]);

        PasskeyCredential::query()->create([
            'user_id' => $user->id,
            'credential_id' => 'cred-abc',
            'public_key' => 'stored-key',
            'sign_count' => 0,
            'transports' => ['internal'],
            'name' => 'Device',
        ]);

        $this->postJson('/login/passkey/options', [
            'email' => 'passkey@example.com',
        ])->assertOk();

        $challenge = (string) session('passkey.login.challenge');
        $this->assertNotSame('', $challenge);

        $clientData = $this->base64urlEncode((string) json_encode([
            'type' => 'webauthn.get',
            'challenge' => $challenge,
            'origin' => 'http://localhost',
        ]));

        $this->postJson('/login/passkey/verify', [
            'id' => 'cred-abc',
            'response' => [
                'clientDataJSON' => $clientData,
                'authenticatorData' => $this->base64urlEncode('auth-data'),
                'signature' => $this->base64urlEncode('signature'),
            ],
        ])->assertOk()->assertJsonPath('redirect', route('library'));

        $this->assertAuthenticatedAs($user);
    }

    private function base64urlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
