<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Libraries\Uuid;
use CodeIgniter\Test\CIUnitTestCase;

final class UuidTest extends CIUnitTestCase
{
    public function testGeneratesUniqueVersionFourIdentifiers(): void
    {
        $first  = Uuid::v4();
        $second = Uuid::v4();

        $this->assertMatchesRegularExpression(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/',
            $first,
        );
        $this->assertNotSame($first, $second);
    }
}
