from typing import Dict, List, Any, Tuple
from backend.mock_data import MOCK_MUTUAL_FUNDS

def analyze_mutual_fund(symbol: str, fund_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates mutual fund parameters and generates actionable advisor recommendations.
    """
    name = fund_data.get("name", symbol)
    metrics = fund_data.get("metrics", {})
    category = fund_data.get("category", "General")

    sharpe = metrics.get("sharpe_ratio", 0.0)
    alpha = metrics.get("alpha", 0.0)
    beta = metrics.get("beta", 1.0)
    returns = metrics.get("rolling_returns_3y", 0.0)
    downside = metrics.get("downside_risk", 0.0)
    er = metrics.get("expense_ratio", 0.0)
    
    cat_sharpe = metrics.get("category_avg_sharpe", 1.0)
    cat_return = metrics.get("category_avg_return", 12.0)

    reasons = []
    # Recommendation logic: Continue SIP, Review, Replace
    if sharpe >= cat_sharpe and alpha > 1.0 and returns >= cat_return:
        recommendation = "Continue SIP"
        reasons.append(f"Outstanding risk-adjusted performance with Sharpe ratio of {sharpe} (Category Avg: {cat_sharpe})")
        reasons.append(f"Delivering positive alpha of {alpha}% over its benchmark index")
        reasons.append(f"Consistent 3-year rolling CAGR of {returns}% outperforming category average of {cat_return}%")
    elif alpha >= -1.0 and returns >= (cat_return - 2.0):
        recommendation = "Review"
        reasons.append(f"Performance is in-line with peers (Sharpe: {sharpe}, Return: {returns}%)")
        if er > 0.8:
            reasons.append(f"Relatively high expense ratio of {er}% dragging down net yields")
        if downside > 5.0:
            reasons.append(f"Elevated downside risk ({downside}%) relative to category profile")
    else:
        recommendation = "Replace"
        reasons.append(f"Persistent underperformance: negative Alpha of {alpha}% vs index")
        reasons.append(f"Weak Sharpe ratio ({sharpe}) compared to average peer index ({cat_sharpe})")
        reasons.append(f"Returns of {returns}% lag behind category averages ({cat_return}%)")

    return {
        "symbol": symbol,
        "name": name,
        "category": category,
        "metrics": metrics,
        "recommendation": recommendation,
        "reasons": reasons
    }

def check_sip_health(sip_transactions: List[Dict[str, Any]], current_value: float) -> Dict[str, Any]:
    """
    Evaluates SIP Health based on frequency and performance consistency.
    """
    if not sip_transactions:
        return {"status": "Unknown", "cagr": 0.0, "message": "No SIP transaction history found."}

    # Calculate total invested & average timeframe
    total_invested = sum(tx["quantity"] * tx["price"] for tx in sip_transactions)
    if total_invested <= 0:
        return {"status": "Unknown", "cagr": 0.0, "message": "Zero investment amount recorded."}

    # Graded based on returns
    gains = current_value - total_invested
    pct_gains = (gains / total_invested) * 100 if total_invested > 0 else 0.0

    if pct_gains >= 20.0:
        status = "Excellent"
        message = f"Portfolio shows spectacular growth of {pct_gains:.2f}%. Excellent wealth creation trajectory."
    elif pct_gains >= 10.0:
        status = "Healthy"
        message = f"Steady compound growth of {pct_gains:.2f}%. Keep investing consistently."
    elif pct_gains >= 0:
        status = "Average"
        message = f"Modest growth of {pct_gains:.2f}%. Mutual fund is accumulating stable returns."
    else:
        status = "Underperforming"
        message = f"Negative returns of {pct_gains:.2f}%. Undergoing market correction, good time to average out."

    return {
        "status": status,
        "total_invested": total_invested,
        "current_value": current_value,
        "percentage_gain": pct_gains,
        "message": message
    }

def calculate_portfolio_overlap(user_mf_holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes pairwise overlap percentages and overall underlying stock concentration.
    user_mf_holdings: List of dicts with {"symbol": str, "value": float} representing holdings
    """
    total_mf_value = sum(h["value"] for h in user_mf_holdings)
    if total_mf_value <= 0:
        return {"pairwise_overlap": [], "stock_concentration": [], "warnings": []}

    # Normalize weights of each MF in the user's MF portfolio
    mf_weights = {}
    for h in user_mf_holdings:
        mf_weights[h["symbol"]] = h["value"] / total_mf_value

    # 1. Pairwise Overlap Matrix
    pairwise = []
    mf_symbols = list(mf_weights.keys())
    
    for i in range(len(mf_symbols)):
        for j in range(i + 1, len(mf_symbols)):
            mf1 = mf_symbols[i]
            mf2 = mf_symbols[j]
            
            data1 = MOCK_MUTUAL_FUNDS.get(mf1)
            data2 = MOCK_MUTUAL_FUNDS.get(mf2)
            
            if not data1 or not data2:
                continue
                
            holdings1 = data1.get("top_holdings", {})
            holdings2 = data2.get("top_holdings", {})
            
            overlap_pct = 0.0
            shared_stocks = []
            
            for stock, w1 in holdings1.items():
                if stock in holdings2:
                    w2 = holdings2[stock]
                    overlap_contrib = min(w1, w2)
                    overlap_pct += overlap_contrib
                    shared_stocks.append(stock)
            
            pairwise.append({
                "fund_a": data1["name"],
                "fund_b": data2["name"],
                "overlap_percentage": round(overlap_pct, 2),
                "shared_stocks": shared_stocks
            })

    # 2. Overall Stock Concentration (Aggregated Underlying Stock Weights)
    stock_weights = {}
    for mf_sym, mf_weight in mf_weights.items():
        data = MOCK_MUTUAL_FUNDS.get(mf_sym)
        if not data:
            continue
        top_holdings = data.get("top_holdings", {})
        for stock, weight_in_mf in top_holdings.items():
            # weight_in_mf is in percentage (e.g. 8.5), we divide by 100
            contribution = (weight_in_mf / 100.0) * mf_weight
            stock_weights[stock] = stock_weights.get(stock, 0.0) + contribution

    # Convert to sorted list of percentages
    stock_concentration = []
    for stock, w in sorted(stock_weights.items(), key=lambda x: x[1], reverse=True):
        stock_concentration.append({
            "stock": stock,
            "aggregate_weight": round(w * 100, 2)
        })

    # 3. Formulate Warnings
    warnings = []
    for p in pairwise:
        if p["overlap_percentage"] > 35.0:
            warnings.append(
                f"High overlap ({p['overlap_percentage']}%) detected between {p['fund_a']} and {p['fund_b']}. Consider consolidating."
            )
            
    for sc in stock_concentration:
        if sc["aggregate_weight"] > 15.0:
            warnings.append(
                f"Aggregated stock concentration risk: {sc['stock']} accounts for {sc['aggregate_weight']}% of your total mutual fund portfolio."
            )

    return {
        "pairwise_overlap": pairwise,
        "stock_concentration": stock_concentration,
        "warnings": warnings
    }
