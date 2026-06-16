import sys
import os
from datetime import date

# Append workspace directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.analytics.calculations import calculate_cagr, calculate_xirr
from backend.analytics.stocks import analyze_stock
from backend.analytics.mutual_funds import calculate_portfolio_overlap

def test_cagr_calculation():
    # Invest 10,000, grows to 14,400 in 2 years. Expected CAGR is 20%
    invested = 10000.0
    current = 14400.0
    years = 2.0
    cagr = calculate_cagr(invested, current, years)
    assert abs(cagr - 0.20) < 1e-4, f"CAGR failed: expected 0.20, got {cagr}"
    print("✓ CAGR calculations verified successfully.")

def test_xirr_calculation():
    # Buy 10000 on 2024-01-01, value 12100 on 2026-01-01 (exactly 2 years).
    # Expected XIRR is 10% annualized compounding (1.1 * 1.1 = 1.21)
    d1 = date(2024, 1, 1)
    d2 = date(2026, 1, 1)
    flows = [
        (d1, -10000.0),
        (d2, 12100.0)
    ]
    xirr = calculate_xirr(flows)
    assert abs(xirr - 0.10) < 1e-3, f"XIRR failed: expected 0.10, got {xirr}"
    print("✓ XIRR solver convergence verified successfully.")

def test_stock_recommendation_logic():
    # Test high ROE, low Debt, high growth stock -> Should be Accumulate or Buy on Dips
    mock_high_quality = {
        "name": "Super Growth Limited",
        "price": 100.0,
        "fundamentals": {
            "pe": 18.0,
            "pb": 2.0,
            "roe": 25.0,
            "roce": 28.0,
            "debt_to_equity": 0.1,
            "revenue_growth": 15.0,
            "eps_growth": 18.0,
            "promoter_holding": 60.0,
            "institutional_holding": 25.0
        },
        "technicals": {
            "ema20": 98.0,
            "ema50": 95.0,
            "ema200": 90.0,
            "rsi": 55.0,
            "macd": "Bullish",
            "adx": 28.0,
            "volume_breakout": 1.2
        },
        "sector": "Technology"
    }
    analysis = analyze_stock("SUPERGR", mock_high_quality)
    assert analysis["fundamental_score"] >= 70, "Fundamental scoring failed"
    assert analysis["recommendation"] in ["Accumulate", "Buy on Dips"], f"Recommendation mismatch: {analysis['recommendation']}"
    print("✓ Stock recommendation rules verified successfully.")

def test_mf_overlap_logic():
    # Compare overlapping holdings of mock mutual funds
    user_holdings = [
        {"symbol": "PPFAS_FLEXICAP", "value": 50000.0},
        {"symbol": "SBI_BLUECHIP", "value": 50000.0}
    ]
    overlap_res = calculate_portfolio_overlap(user_holdings)
    # Check that aggregate stock exposure is calculated
    assert len(overlap_res["stock_concentration"]) > 0, "Stock concentration calculations failed"
    assert len(overlap_res["pairwise_overlap"]) > 0, "Pairwise overlap failed"
    print("✓ Mutual Fund portfolio overlap auditor verified successfully.")

if __name__ == "__main__":
    print("Running backend financial test suite...")
    try:
        test_cagr_calculation()
        test_xirr_calculation()
        test_stock_recommendation_logic()
        test_mf_overlap_logic()
        print("\nAll financial tests passed successfully!")
    except AssertionError as e:
        print(f"\nAssertion Error: {str(e)}")
        sys.exit(1)
    except Exception as e:
        print(f"\nUnexpected error: {str(e)}")
        sys.exit(1)
