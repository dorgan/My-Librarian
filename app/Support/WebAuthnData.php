<?php

namespace App\Support;

class WebAuthnData
{
    public static function assertClientDataChallenge(string $encodedClientDataJson, string $expectedChallenge, string $expectedType, string $expectedOrigin): void
    {
        $decoded = self::base64urlDecode($encodedClientDataJson);
        $clientData = json_decode($decoded, true);
        abort_unless(is_array($clientData), 422);

        abort_unless(($clientData['type'] ?? null) === $expectedType, 422);
        abort_unless(($clientData['challenge'] ?? null) === $expectedChallenge, 422);
        abort_unless(($clientData['origin'] ?? null) === $expectedOrigin, 422);
    }

    /** @return array<int, int> */
    public static function bytesFromBase64url(string $value): array
    {
        return array_values(unpack('C*', self::base64urlDecode($value)) ?: []);
    }

    public static function base64urlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    public static function base64urlDecode(string $value): string
    {
        $padding = strlen($value) % 4;
        if ($padding > 0) {
            $value .= str_repeat('=', 4 - $padding);
        }

        return base64_decode(strtr($value, '-_', '+/'), true) ?: '';
    }
}
