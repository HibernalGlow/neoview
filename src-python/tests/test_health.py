"""
健康检查端点测试
Property: Health Check Availability
Validates: Requirements 5.4
"""
import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from fastapi.testclient import TestClient

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from main import app


class TestHealthCheck:
    """健康检查测试"""
    
    def test_health_endpoint_returns_ok(self, client):
        """测试健康检查端点返回 ok"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "service" in data
    
    @given(st.integers(min_value=1, max_value=100))
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    def test_health_endpoint_always_available(self, _):
        """
        Property: Health Check Availability
        健康检查端点应始终可用
        Validates: Requirements 5.4
        """
        # 使用独立的客户端避免 fixture 问题
        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 200
            assert response.json()["status"] == "ok"
