"""
Tests for the API Gateway's routing/proxy logic. The gateway has no
business logic of its own — its entire job is "forward this request
to the right service, unchanged" — so these tests mock requests.request
and assert on WHERE each route sends things, plus that connection
failures degrade to clean 503/504s instead of crashing.
"""
import os
import sys
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
import requests
import app as gateway_module


@pytest.fixture
def client():
    gateway_module.app.config["TESTING"] = True
    with gateway_module.app.test_client() as c:
        yield c


def _mock_upstream(status_code=200, json_body=b'{"ok": true}'):
    resp = MagicMock()
    resp.status_code = status_code
    resp.content = json_body
    resp.headers = {"Content-Type": "application/json"}
    return resp


# ---- Routing table: each route hits the right service + path ----

@pytest.mark.parametrize("method,path,expected_base,expected_path", [
    ("POST", "/register", "USER_SERVICE_URL", "/register"),
    ("POST", "/login", "USER_SERVICE_URL", "/login"),
    ("GET", "/profile", "USER_SERVICE_URL", "/profile"),
    ("GET", "/favorites", "USER_SERVICE_URL", "/favorites"),
    ("POST", "/favorites", "USER_SERVICE_URL", "/favorites"),
    ("DELETE", "/favorites/7", "USER_SERVICE_URL", "/favorites/7"),
    ("GET", "/feedback", "USER_SERVICE_URL", "/feedback"),
    ("GET", "/destinations", "RECOMMENDATION_SERVICE_URL", "/destinations"),
    ("GET", "/destinations/3/nearby", "RECOMMENDATION_SERVICE_URL", "/destinations/3/nearby"),
    ("GET", "/neighborhoods/Bastos", "RECOMMENDATION_SERVICE_URL", "/neighborhoods/Bastos"),
    ("GET", "/recommendations", "RECOMMENDATION_SERVICE_URL", "/recommendations"),
    ("GET", "/destinations/3/reviews", "ITINERARY_SERVICE_URL", "/destinations/3/reviews"),
    ("GET", "/itineraries", "ITINERARY_SERVICE_URL", "/itineraries"),
    ("POST", "/itineraries", "ITINERARY_SERVICE_URL", "/itineraries"),
    ("PATCH", "/itineraries/9/visit", "ITINERARY_SERVICE_URL", "/itineraries/9/visit"),
])
def test_route_forwards_to_correct_service(client, method, path, expected_base, expected_path):
    expected_url = getattr(gateway_module, expected_base) + expected_path
    with patch.object(gateway_module.requests, "request", return_value=_mock_upstream()) as mock_req:
        client.open(path, method=method, json={})
        assert mock_req.called
        called_url = mock_req.call_args.kwargs["url"]
        assert called_url == expected_url
        assert mock_req.call_args.kwargs["method"] == method


def test_proxy_passes_through_status_code(client):
    with patch.object(gateway_module.requests, "request", return_value=_mock_upstream(status_code=404)):
        resp = client.get("/destinations/999/nearby")
        assert resp.status_code == 404


def test_proxy_passes_through_query_params(client):
    with patch.object(gateway_module.requests, "request", return_value=_mock_upstream()) as mock_req:
        client.get("/destinations?category=spa&neighborhood=Bastos")
        params = mock_req.call_args.kwargs["params"]
        assert params["category"] == "spa"
        assert params["neighborhood"] == "Bastos"


def test_proxy_passes_through_auth_header(client):
    with patch.object(gateway_module.requests, "request", return_value=_mock_upstream()) as mock_req:
        client.get("/profile", headers={"Authorization": "Bearer sometoken"})
        headers = mock_req.call_args.kwargs["headers"]
        assert headers.get("Authorization") == "Bearer sometoken"


# ---- Resilience: a downstream service being unreachable shouldn't crash the gateway ----

def test_connection_error_returns_503(client):
    with patch.object(gateway_module.requests, "request", side_effect=requests.ConnectionError()):
        resp = client.get("/destinations")
        assert resp.status_code == 503
        assert "unavailable" in resp.get_json()["error"]


def test_timeout_returns_504(client):
    with patch.object(gateway_module.requests, "request", side_effect=requests.Timeout()):
        resp = client.get("/recommendations")
        assert resp.status_code == 504
        assert "timed out" in resp.get_json()["error"]


# ---- Aggregate health check ----

def test_health_all_services_up(client):
    with patch.object(gateway_module.requests, "get", return_value=_mock_upstream()):
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.get_json()
        assert body["services"]["user-service"] == "ok"
        assert body["services"]["itinerary-service"] == "ok"
        assert body["services"]["recommendation-service"] == "ok"


def test_health_one_service_down(client):
    def fake_get(url, timeout=None):
        if "5002" in url:  # itinerary-service port
            raise requests.RequestException("down")
        return _mock_upstream()

    with patch.object(gateway_module.requests, "get", side_effect=fake_get):
        resp = client.get("/health")
        assert resp.status_code == 503
        body = resp.get_json()
        assert body["services"]["itinerary-service"] == "unreachable"
        assert body["services"]["user-service"] == "ok"
