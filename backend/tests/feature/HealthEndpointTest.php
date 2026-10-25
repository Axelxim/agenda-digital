<?php

namespace Tests\Feature;

use CodeIgniter\Test\CIUnitTestCase;
use CodeIgniter\Test\FeatureTestTrait;

final class HealthEndpointTest extends CIUnitTestCase
{
    use FeatureTestTrait;

    public function testHealthEndpointReturnsApiStatus(): void
    {
        $result = $this->get('/api/v1/health');

        $result->assertStatus(200);
        $result->assertJSONFragment([
            'data' => [
                'status'  => 'ok',
                'service' => 'todo-en-orden-api',
                'version' => 'v1',
            ],
        ]);
    }
}
