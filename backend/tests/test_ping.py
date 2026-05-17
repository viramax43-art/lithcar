async def test_ping_returns_postgres_ok(client):
    r = await client.get("/api/ping")
    assert r.status_code == 200
    body = r.json()
    assert body["message"] == "pong"
    assert body["postgres"] == "ok"

