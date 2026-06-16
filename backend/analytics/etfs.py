from typing import Dict, Any

def analyze_etf(symbol: str, etf_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates ETF properties and generates recommendations based on tracking error,
    expense ratio, and liquidity metrics.
    """
    name = etf_data.get("name", symbol)
    metrics = etf_data.get("metrics", {})
    category = etf_data.get("category", "General Index")

    te = metrics.get("tracking_error", 0.0)
    er = metrics.get("expense_ratio", 0.0)
    liq = metrics.get("liquidity", "Medium")
    cat_avg_te = metrics.get("category_avg_te", 0.1)
    cat_avg_er = metrics.get("category_avg_er", 0.2)

    evidence = []
    # Recommendation logic: Accumulate, Hold, Reduce
    if te <= cat_avg_te and er <= cat_avg_er and liq in ["High", "Very High"]:
        recommendation = "Accumulate"
        evidence.append(f"Highly efficient index tracking with low error of {te}% (Category Avg: {cat_avg_te}%)")
        evidence.append(f"Ultra-low expense ratio of {er}% makes it cost-effective for long term compounding")
        evidence.append(f"Strong daily exchange liquidity ({liq}) ensures minimal bid-ask spread impact")
    elif te > (cat_avg_te * 1.5) or er > (cat_avg_er * 1.5) or liq == "Low":
        recommendation = "Reduce"
        if te > cat_avg_te:
            evidence.append(f"Elevated tracking error of {te}% (Category Avg: {cat_avg_te}%), showing high index slippage")
        if er > cat_avg_er:
            evidence.append(f"Excessive cost drag: Expense ratio is high at {er}% (Category Avg: {cat_avg_er}%)")
        if liq == "Low":
            evidence.append("Caution: Low market liquidity could lead to execution delays or wide bid-ask spreads")
    else:
        recommendation = "Hold"
        evidence.append(f"Standard tracking error of {te}% is within acceptable peer boundaries")
        evidence.append(f"Expense ratio is reasonable at {er}%")
        evidence.append(f"Comfortable market liquidity ({liq}) support stable trades")

    return {
        "symbol": symbol,
        "name": name,
        "category": category,
        "metrics": metrics,
        "recommendation": recommendation,
        "evidence": evidence
    }
