# Pre-seeded market data for Stocks, Mutual Funds, ETFs and Risk Indicators
# All values are seeded with real-world Indian market characteristics as of 2026.

MOCK_STOCKS = {
    "RELIANCE": {
        "name": "Reliance Industries Limited",
        "price": 2450.0,
        "fundamentals": {
            "pe": 26.4,
            "pb": 2.1,
            "roe": 12.5,
            "roce": 10.8,
            "debt_to_equity": 0.38,
            "revenue_growth": 8.5,
            "eps_growth": 6.2,
            "promoter_holding": 50.39,
            "institutional_holding": 39.21
        },
        "technicals": {
            "ema20": 2480.0,
            "ema50": 2460.0,
            "ema200": 2380.0,
            "rsi": 45.2,
            "macd": "Neutral",
            "adx": 18.5,
            "volume_breakout": 1.1  # times of 20d avg volume
        },
        "sector": "Energy & Conglomerate"
    },
    "TCS": {
        "name": "Tata Consultancy Services Limited",
        "price": 3820.0,
        "fundamentals": {
            "pe": 30.1,
            "pb": 7.8,
            "roe": 38.6,
            "roce": 49.2,
            "debt_to_equity": 0.01,
            "revenue_growth": 11.2,
            "eps_growth": 9.4,
            "promoter_holding": 72.41,
            "institutional_holding": 22.08
        },
        "technicals": {
            "ema20": 3805.0,
            "ema50": 3720.0,
            "ema200": 3450.0,
            "rsi": 62.4,
            "macd": "Bullish Crossover",
            "adx": 28.1,
            "volume_breakout": 1.4
        },
        "sector": "Information Technology"
    },
    "HDFCBANK": {
        "name": "HDFC Bank Limited",
        "price": 1495.0,
        "fundamentals": {
            "pe": 16.2,
            "pb": 2.3,
            "roe": 16.8,
            "roce": 17.1,
            "debt_to_equity": 0.85,  # Typical for bank
            "revenue_growth": 16.4,
            "eps_growth": 14.2,
            "promoter_holding": 0.0,  # Professionally managed
            "institutional_holding": 78.50
        },
        "technicals": {
            "ema20": 1515.0,
            "ema50": 1530.0,
            "ema200": 1560.0,
            "rsi": 28.5,  # Oversold!
            "macd": "Bearish",
            "adx": 24.2,
            "volume_breakout": 3.2  # Volume spike!
        },
        "sector": "Financial Services"
    },
    "INFOSYS": {
        "name": "Infosys Limited",
        "price": 1410.0,
        "fundamentals": {
            "pe": 22.8,
            "pb": 6.1,
            "roe": 31.2,
            "roce": 40.5,
            "debt_to_equity": 0.02,
            "revenue_growth": 6.8,
            "eps_growth": 4.5,
            "promoter_holding": 14.94,
            "institutional_holding": 70.12
        },
        "technicals": {
            "ema20": 1430.0,
            "ema50": 1460.0,
            "ema200": 1490.0,
            "rsi": 32.1,
            "macd": "Neutral",
            "adx": 19.8,
            "volume_breakout": 1.5
        },
        "sector": "Information Technology"
    },
    "ADANIENT": {
        "name": "Adani Enterprises Limited",
        "price": 3150.0,
        "fundamentals": {
            "pe": 108.5,
            "pb": 9.4,
            "roe": 8.1,
            "roce": 7.4,
            "debt_to_equity": 1.75,
            "revenue_growth": 35.6,
            "eps_growth": 42.1,
            "promoter_holding": 72.63,
            "institutional_holding": 18.25
        },
        "technicals": {
            "ema20": 3190.0,
            "ema50": 2980.0,
            "ema200": 2600.0,
            "rsi": 78.4,  # Overbought
            "macd": "Bullish",
            "adx": 34.5,
            "volume_breakout": 0.95
        },
        "sector": "Metals & Mining"
    },
    "COALINDIA": {
        "name": "Coal India Limited",
        "price": 435.0,
        "fundamentals": {
            "pe": 8.2,
            "pb": 1.9,
            "roe": 44.8,
            "roce": 51.5,
            "debt_to_equity": 0.12,
            "revenue_growth": 4.8,
            "eps_growth": 7.5,
            "promoter_holding": 63.13,
            "institutional_holding": 28.45
        },
        "technicals": {
            "ema20": 430.0,
            "ema50": 415.0,
            "ema200": 360.0,
            "rsi": 58.1,
            "macd": "Neutral",
            "adx": 22.4,
            "volume_breakout": 0.8
        },
        "sector": "Power & Utilities"
    },
    "YESBANK": {
        "name": "Yes Bank Limited",
        "price": 22.1,
        "fundamentals": {
            "pe": 62.4,
            "pb": 1.15,
            "roe": 1.8,
            "roce": 2.5,
            "debt_to_equity": 1.95,
            "revenue_growth": -2.4,
            "eps_growth": -12.8,
            "promoter_holding": 0.0,
            "institutional_holding": 42.50
        },
        "technicals": {
            "ema20": 22.8,
            "ema50": 23.5,
            "ema200": 24.2,
            "rsi": 39.5,
            "macd": "Bearish",
            "adx": 16.4,
            "volume_breakout": 0.6
        },
        "sector": "Financial Services"
    }
}

MOCK_MUTUAL_FUNDS = {
    "PPFAS_FLEXICAP": {
        "name": "Parag Parikh Flexi Cap Fund",
        "price": 72.4,
        "metrics": {
            "sharpe_ratio": 1.42,
            "alpha": 4.5,  # % vs Nifty 500
            "beta": 0.86,
            "rolling_returns_3y": 18.2,  # % CAGR
            "downside_risk": 3.1,  # Lower the better
            "expense_ratio": 0.58,  # %
            "benchmark": "Nifty 500 TRI",
            "category_avg_sharpe": 1.1,
            "category_avg_return": 15.4
        },
        "top_holdings": {
            "RELIANCE": 8.5,
            "HDFCBANK": 7.2,
            "TCS": 6.1,
            "INFOSYS": 4.5,
            "ITC": 4.1
        },
        "category": "Flexi Cap"
    },
    "SBI_BLUECHIP": {
        "name": "SBI Bluechip Fund",
        "price": 84.6,
        "metrics": {
            "sharpe_ratio": 1.05,
            "alpha": 0.8,
            "beta": 0.96,
            "rolling_returns_3y": 14.2,
            "downside_risk": 4.2,
            "expense_ratio": 0.82,
            "benchmark": "Nifty 100 TRI",
            "category_avg_sharpe": 1.0,
            "category_avg_return": 13.9
        },
        "top_holdings": {
            "HDFCBANK": 9.1,
            "RELIANCE": 7.4,
            "ICICIBANK": 6.8,
            "INFOSYS": 5.2,
            "LT": 4.8
        },
        "category": "Large Cap"
    },
    "NIPPON_SMALLCAP": {
        "name": "Nippon India Small Cap Fund",
        "price": 145.2,
        "metrics": {
            "sharpe_ratio": 1.62,
            "alpha": 7.8,
            "beta": 1.12,
            "rolling_returns_3y": 24.5,
            "downside_risk": 5.8,
            "expense_ratio": 0.68,
            "benchmark": "Nifty Smallcap 250 TRI",
            "category_avg_sharpe": 1.3,
            "category_avg_return": 20.2
        },
        "top_holdings": {
            "TUBEINVEST": 4.2,
            "HDFCBANK": 3.1,
            "KPRMILL": 2.5,
            "KPIT": 2.2,
            "COALINDIA": 1.8
        },
        "category": "Small Cap"
    },
    "AXIS_ELSS": {
        "name": "Axis ELSS Tax Saver Fund",
        "price": 92.1,
        "metrics": {
            "sharpe_ratio": 0.78,
            "alpha": -1.8,
            "beta": 1.03,
            "rolling_returns_3y": 11.5,
            "downside_risk": 5.9,
            "expense_ratio": 0.92,
            "benchmark": "Nifty 500 TRI",
            "category_avg_sharpe": 1.1,
            "category_avg_return": 15.4
        },
        "top_holdings": {
            "ICICIBANK": 8.2,
            "HDFCBANK": 7.5,
            "TCS": 5.4,
            "INFOSYS": 4.8,
            "RELIANCE": 4.2
        },
        "category": "ELSS / Tax Saver"
    }
}

MOCK_ETFS = {
    "NIFTY_BEES": {
        "name": "Nippon India ETF Nifty 50 BeES",
        "price": 242.5,
        "metrics": {
            "tracking_error": 0.03,  # %
            "expense_ratio": 0.04,  # %
            "liquidity": "Very High",  # High / Medium / Low
            "category_avg_te": 0.06,
            "category_avg_er": 0.12
        },
        "category": "Equity Index"
    },
    "JUNIORBEES": {
        "name": "Nippon India ETF Nifty Next 50 BeES",
        "price": 590.2,
        "metrics": {
            "tracking_error": 0.08,
            "expense_ratio": 0.15,
            "liquidity": "High",
            "category_avg_te": 0.09,
            "category_avg_er": 0.18
        },
        "category": "Equity Index"
    },
    "MON100": {
        "name": "Motilal Oswal Nasdaq 100 ETF",
        "price": 148.0,
        "metrics": {
            "tracking_error": 0.28,
            "expense_ratio": 0.52,
            "liquidity": "Medium",
            "category_avg_te": 0.22,
            "category_avg_er": 0.45
        },
        "category": "International Index"
    },
    "GOLDBEES": {
        "name": "Nippon India ETF Gold BeES",
        "price": 62.4,
        "metrics": {
            "tracking_error": 0.05,
            "expense_ratio": 0.12,
            "liquidity": "High",
            "category_avg_te": 0.07,
            "category_avg_er": 0.15
        },
        "category": "Gold"
    }
}

# Market Risk Indicators
MOCK_RISK_INDICATORS = {
    "india_vix": 14.5,
    "market_breadth": 1.25,  # Advancing/Declining ratio (1.25 is positive/stable)
    "nifty_pe": 22.8,        # Historical average is ~20-22
    "nifty_pb": 4.2,
    "fii_flows_crores": 1250, # Net Inflows (+ve buy, -ve sell)
    "dii_flows_crores": 850
}
