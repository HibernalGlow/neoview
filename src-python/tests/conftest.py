"""pytest 配置和 fixtures"""
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app


@pytest.fixture(scope="module")
def client():
    """同步测试客户端（模块级别）"""
    return TestClient(app)


@pytest.fixture
async def async_client():
    """异步测试客户端"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
