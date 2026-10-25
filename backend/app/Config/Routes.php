<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */
$routes->get('/', 'Home::index');
$routes->options('api/v1/(:any)', static fn () => service('response')->setStatusCode(204));

$routes->group('api/v1', static function (RouteCollection $routes): void {
    $routes->get('health', 'Api\\HealthController::index');
    $routes->get('integraciones/google-calendar/callback', 'Api\\GoogleCalendarController::callback');

    $routes->group('auth', static function (RouteCollection $routes): void {
        $routes->post('register', 'Api\\AuthController::register', ['filter' => 'auth-rates']);
        $routes->post('login', 'Api\\AuthController::login', ['filter' => 'auth-rates']);
        $routes->post('google', 'Api\\AuthController::google', ['filter' => 'auth-rates']);

        $routes->group('', ['filter' => 'tokens'], static function (RouteCollection $routes): void {
            $routes->get('me', 'Api\\AuthController::me');
            $routes->patch('me', 'Api\\AuthController::updateProfile');
            $routes->post('logout', 'Api\\AuthController::logout');
            $routes->post('logout-all', 'Api\\AuthController::logoutAll');
        });
    });

    $routes->group('', ['filter' => 'tokens'], static function (RouteCollection $routes): void {
        $routes->get('agenda', 'Api\\AgendaController::listar', ['filter' => 'scope:sync']);
        $routes->post('agenda/sincronizar', 'Api\\AgendaController::sincronizar', ['filter' => 'scope:sync']);
        $routes->get('rutinas', 'Api\\RutinasController::listar', ['filter' => 'scope:sync']);
        $routes->post('rutinas/sincronizar', 'Api\\RutinasController::sincronizar', ['filter' => 'scope:sync']);
        $routes->get('datos-personales', 'Api\\DatosPersonalesController::listar', ['filter' => 'scope:sync']);
        $routes->put('datos-personales', 'Api\\DatosPersonalesController::sincronizar', ['filter' => 'scope:sync']);
        $routes->get('bienestar/tratamientos', 'Api\\BienestarController::tratamientos', ['filter' => 'scope:sync']);
        $routes->get('bienestar/tomas', 'Api\\BienestarController::tomas', ['filter' => 'scope:sync']);
        $routes->put('bienestar/sincronizar', 'Api\\BienestarController::sincronizar', ['filter' => 'scope:sync']);
        $routes->get('notas', 'Api\\NotasController::listar', ['filter' => 'scope:sync']);
        $routes->put('notas/sincronizar', 'Api\\NotasController::sincronizar', ['filter' => 'scope:sync']);
        $routes->get('billetera', 'Api\\BilleteraController::listar', ['filter' => 'scope:sync']);
        $routes->put('billetera/sincronizar', 'Api\\BilleteraController::sincronizar', ['filter' => 'scope:sync']);
        $routes->get('preferencias', 'Api\\PreferenciasController::listar', ['filter' => 'scope:sync']);
        $routes->put('preferencias', 'Api\\PreferenciasController::actualizar', ['filter' => 'scope:sync']);
        $routes->get('integraciones/google-calendar/estado', 'Api\\GoogleCalendarController::estado');
        $routes->post('integraciones/google-calendar/autorizar', 'Api\\GoogleCalendarController::autorizar');
        $routes->get('integraciones/google-calendar/calendarios', 'Api\\GoogleCalendarController::calendarios');
        $routes->put('integraciones/google-calendar/calendarios', 'Api\\GoogleCalendarController::seleccionarCalendarios');
        $routes->get('integraciones/google-calendar/eventos', 'Api\\GoogleCalendarController::eventos');
        $routes->delete('integraciones/google-calendar', 'Api\\GoogleCalendarController::desconectar');
    });
});
