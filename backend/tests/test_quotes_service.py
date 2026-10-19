"""Unit tests for live quote helpers (no network)."""
from app.quotes_service import Quote, QuotesService, resolve_market_price


def test_resolve_market_price_prefers_session_quote():
    info = {"regularMarketPrice": 101.5, "previousClose": 100.0}
    assert resolve_market_price(info, None) == 101.5


def test_resolve_market_price_falls_back_to_previous_close():
    assert resolve_market_price({"previousClose": 88.2}, None) == 88.2


def test_apply_to_analysis_updates_price_and_undervalued():
    record = {
        "symbol": "AAA",
        "price": 50.0,
        "mos_price": 80.0,
        "verdict_details": {"undervalued": False},
    }
    quote = Quote(symbol="AAA", price=70.0, previous_close=68.0, change_pct=2.94, as_of="t", source="test")
    out = QuotesService.apply_to_analysis(record, quote)
    assert out["price"] == 70.0
    assert out["price_live"] is True
    assert out["verdict_details"]["undervalued"] is True


def test_apply_to_scanner_row():
    row = {"symbol": "BBB", "current_price": 10.0}
    quote = Quote(symbol="BBB", price=11.25, previous_close=10.0, change_pct=12.5, as_of="t", source="test")
    out = QuotesService.apply_to_scanner_row(row, quote)
    assert out["current_price"] == 11.25
    assert out["price_live"] is True
