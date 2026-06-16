from typing import List, Dict, Any
from backend.mock_data import MOCK_STOCKS, MOCK_MUTUAL_FUNDS, MOCK_ETFS, MOCK_RISK_INDICATORS

def get_asset_risk_weight(asset_class: str, symbol: str) -> float:
    """
    Returns a baseline risk weight (0-100) for a given asset.
    """
    asset_class = asset_class.upper()
    if asset_class == "CASH":
        return 5.0
    elif asset_class == "GOLD_ETF":
        return 15.0
    elif asset_class == "ETF":
        # Check specific ETF risk properties
        etf_data = MOCK_ETFS.get(symbol, {})
        category = etf_data.get("category", "")
        if "Gold" in category:
            return 15.0
        elif "International" in category:
            return 50.0
        return 40.0  # Index ETFs
    elif asset_class == "MUTUAL_FUND":
        # Check fund type
        fund_data = MOCK_MUTUAL_FUNDS.get(symbol, {})
        category = fund_data.get("category", "")
        if "Small Cap" in category:
            return 75.0
        elif "Mid Cap" in category:
            return 60.0
        elif "ELSS" in category:
            return 52.0
        return 50.0  # Large/Flexi Cap
    elif asset_class == "STOCK":
        stock_data = MOCK_STOCKS.get(symbol, {})
        fund = stock_data.get("fundamentals", {})
        pe = fund.get("pe", 20.0)
        de = fund.get("debt_to_equity", 0.5)
        
        # High PE + High Debt = High Risk stock
        if pe > 50.0 or de > 1.2:
            return 85.0
        # Dividend play / low PE utilities = Lower stock risk
        elif pe < 12.0:
            return 45.0
        return 60.0  # Standard bluechip
    return 50.0

def calculate_portfolio_risk_score(holdings: List[Dict[str, Any]], indicators: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Computes overall portfolio risk score (0-100) and produces risk classification.
    """
    if not holdings:
        return {"risk_score": 0, "classification": "Low", "adjustments": [], "weighted_base": 0}

    if not indicators:
        indicators = MOCK_RISK_INDICATORS

    # 1. Base Weighted Risk calculation
    total_val = sum(h["quantity"] * h["buy_price"] for h in holdings) # Using cost basis or current value
    if total_val <= 0:
        return {"risk_score": 0, "classification": "Low", "adjustments": [], "weighted_base": 0}

    weighted_risk_sum = 0.0
    for h in holdings:
        val = h["quantity"] * h["buy_price"]
        item_risk = get_asset_risk_weight(h["asset_class"], h["symbol"])
        weighted_risk_sum += (val * item_risk)

    base_risk = weighted_risk_sum / total_val
    risk_score = base_risk
    adjustments = []

    # 2. Adjustments based on Market Indicators
    # India VIX Volatility
    vix = indicators.get("india_vix", 14.5)
    if vix > 22.0:
        risk_score += 10.0
        adjustments.append(f"VIX is elevated at {vix} (High Volatility Market panic: +10 pts)")
    elif vix > 18.0:
        risk_score += 5.0
        adjustments.append(f"VIX is rising at {vix} (Medium Volatility: +5 pts)")
    elif vix < 12.0:
        risk_score -= 5.0
        adjustments.append(f"VIX is low at {vix} (Stable, low-volatility environment: -5 pts)")

    # Nifty Valuation (PE Ratio)
    pe = indicators.get("nifty_pe", 22.8)
    if pe > 24.0:
        risk_score += 8.0
        adjustments.append(f"Nifty 50 PE is high at {pe} (Overvalued market: +8 pts)")
    elif pe < 18.0:
        risk_score -= 5.0
        adjustments.append(f"Nifty 50 PE is attractive at {pe} (Undervalued market: -5 pts)")

    # Institutional capital flow
    fii = indicators.get("fii_flows_crores", 0)
    dii = indicators.get("dii_flows_crores", 0)
    if (fii + dii) < -2000:
        risk_score += 5.0
        adjustments.append("Strong institutional net outflow/selling pressure (+5 pts)")
    elif (fii + dii) > 2500:
        risk_score -= 3.0
        adjustments.append("Healthy institutional buying momentum support (-3 pts)")

    # Market Breadth
    breadth = indicators.get("market_breadth", 1.0)
    if breadth < 0.75:
        risk_score += 4.0
        adjustments.append(f"Poor market breadth ({breadth} Adv/Dec ratio: +4 pts)")

    final_score = max(0.0, min(100.0, risk_score))
    
    # Classification
    if final_score < 35.0:
        classification = "Low"
    elif final_score < 65.0:
        classification = "Medium"
    else:
        classification = "High"

    return {
        "risk_score": round(final_score, 1),
        "weighted_base": round(base_risk, 1),
        "classification": classification,
        "adjustments": adjustments
    }

def simulate_market_corrections(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Projects portfolio values and losses across corrections of 10%, 20%, 30% and 40%.
    """
    total_current_value = sum(h["quantity"] * h["buy_price"] for h in holdings)
    
    results = {}
    
    for shock in [10, 20, 30, 40]:
        simulated_value = 0.0
        loss_details = []
        
        for h in holdings:
            val = h["quantity"] * h["buy_price"]
            ac = h["asset_class"].upper()
            sym = h["symbol"]
            
            # Asset specific beta / stress behavior
            if ac == "CASH":
                drop_pct = 0.0  # Cash is unaffected
            elif ac == "GOLD_ETF":
                # Gold behaves as safe haven during deep corrections
                if shock == 10:
                    drop_pct = 1.0
                elif shock == 20:
                    drop_pct = -1.0  # Gains 1%
                else:
                    drop_pct = -3.0  # Gains 3%
            elif ac == "ETF":
                drop_pct = shock * 1.0  # Moves in line with market index
            elif ac == "MUTUAL_FUND":
                fund_data = MOCK_MUTUAL_FUNDS.get(sym, {})
                category = fund_data.get("category", "")
                if "Small Cap" in category:
                    drop_pct = shock * 1.4  # High beta small cap drops more
                elif "Mid Cap" in category:
                    drop_pct = shock * 1.2
                else:
                    drop_pct = shock * 1.0
            elif ac == "STOCK":
                stock_data = MOCK_STOCKS.get(sym, {})
                sector = stock_data.get("sector", "")
                fund = stock_data.get("fundamentals", {})
                pe = fund.get("pe", 20.0)
                
                # Tech/Mining and High PE stocks drop more
                if pe > 40.0:
                    drop_pct = shock * 1.35
                elif sector == "Financial Services":
                    drop_pct = shock * 1.15
                else:
                    drop_pct = shock * 1.0
            else:
                drop_pct = shock * 1.0
                
            sim_val = val * (1.0 - (drop_pct / 100.0))
            simulated_value += sim_val
            
            loss_details.append({
                "symbol": sym,
                "asset_class": ac,
                "original_value": round(val, 2),
                "drop_percentage": round(drop_pct, 2),
                "simulated_value": round(sim_val, 2),
                "loss": round(val - sim_val, 2)
            })
            
        total_loss = total_current_value - simulated_value
        pct_loss = (total_loss / total_current_value) * 100 if total_current_value > 0 else 0.0
        
        results[f"shock_{shock}"] = {
            "shock_percentage": shock,
            "simulated_value": round(simulated_value, 2),
            "total_loss": round(total_loss, 2),
            "percentage_loss": round(pct_loss, 2),
            "details": loss_details
        }
        
    return results
