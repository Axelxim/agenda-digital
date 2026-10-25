<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */
$routes->get('/', 'Home::index');

$routes->group('api/v1', static function (RouteCollection $routes): void {
    $routes->get('health', 'Api\\HealthController::index');

    $routes->group('auth', static function (RouteCollection $routes): void {
        $routes->post('register', 'Api\\AuthController::register', ['filter' => 'auth-rates']);
        $routes->post('login', 'Api\\AuthController::login', ['filter' => 'auth-rates']);

        $routes->group('', ['filter' => 'tokens'], static function (RouteCollection $routes): void {
            $routes->get('me', 'Api\\AuthController::me');
            $routes->patch('me', 'Api\\AuthController::updateProfile');
            $routes->post('logout', 'Api\\AuthController::logout');
            $routes->post('logout-all', 'Api\\AuthController::logoutAll');
        });
    });
});
