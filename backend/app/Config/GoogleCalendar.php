<?php

declare(strict_types=1);

namespace Config;

use CodeIgniter\Config\BaseConfig;

final class GoogleCalendar extends BaseConfig
{
    public string $clientId;
    public string $clientSecret;
    public string $redirectUri;
    public string $scope;
    public string $frontendReturnUri;

    public function __construct()
    {
        parent::__construct();
        $this->clientId = (string) env('GOOGLE_CALENDAR_CLIENT_ID', '');
        $this->clientSecret = (string) env('GOOGLE_CALENDAR_CLIENT_SECRET', '');
        $this->redirectUri = (string) env('GOOGLE_CALENDAR_REDIRECT_URI', '');
        $this->scope = (string) env('GOOGLE_CALENDAR_SCOPE', 'https://www.googleapis.com/auth/calendar.readonly');
        $this->frontendReturnUri = (string) env('GOOGLE_CALENDAR_FRONTEND_RETURN_URI', 'http://localhost:8100/home');
    }
}
