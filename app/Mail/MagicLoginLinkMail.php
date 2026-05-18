<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class MagicLoginLinkMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $magicLink,
        public string $context,
        public \DateTimeInterface $expiresAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your My Librarian sign-in link',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.magic-login-link',
        );
    }
}
