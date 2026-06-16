import requests
from typing import List, Dict, Any
from backend.config import GEMINI_API_KEY, AI_PROVIDER
from backend.risk_engine import calculate_portfolio_risk_score, simulate_market_corrections
from backend.analytics.mutual_funds import calculate_portfolio_overlap

def get_portfolio_context_summary(holdings: List[Dict[str, Any]]) -> str:
    """
    Builds a structured text summary of the portfolio holdings, returns, and allocations
    to use as context for the LLM.
    """
    if not holdings:
        return "The portfolio is currently empty. No holdings added yet."

    total_invested = 0.0
    current_value = 0.0
    asset_breakdown = {}
    holding_details = []

    for h in holdings:
        cost = h["quantity"] * h["buy_price"]
        total_invested += cost
        # Using cost as mock price indicator for overall portfolio state
        # In a real app we'd fetch live current prices, we'll assume standard returns
        # For simplicity, let's use the buy_price * quantity as the base valuation
        asset_breakdown[h["asset_class"]] = asset_breakdown.get(h["asset_class"], 0.0) + cost
        holding_details.append(
            f"- {h['symbol']} ({h['asset_class']}): Quantity {h['quantity']}, Avg Buy Price: ₹{h['buy_price']:.2f}, Total Cost: ₹{cost:.2f}"
        )

    summary = f"PORTFOLIO HOLDINGS OVERVIEW:\n"
    summary += f"- Total Invested: ₹{total_invested:.2f}\n"
    summary += f"- Asset Class Allocation:\n"
    for ac, val in asset_breakdown.items():
        summary += f"  * {ac}: ₹{val:.2f} ({ (val/total_invested)*100:.1f}%)\n"
    
    summary += "\nIndividual Holdings List:\n"
    summary += "\n".join(holding_details)
    
    return summary

def generate_local_expert_advice(message: str, holdings: List[Dict[str, Any]]) -> str:
    """
    Offline fallback rule-based advisor. Analyzes portfolio structures and writes
    highly professional financial audits in markdown.
    """
    if not holdings:
        return (
            "### Portfolio Advisory Report (Offline Mode)\n\n"
            "**Current Status**: No holdings detected.\n\n"
            "**Action Plan**:\n"
            "1. Upload your Stock or Mutual Fund transactions using the CSV/Excel uploader.\n"
            "2. Ensure you allocate a portion of your portfolio to cash/liquid funds for emergency reserves."
        )

    total_invested = sum(h["quantity"] * h["buy_price"] for h in holdings)
    asset_breakdown = {}
    for h in holdings:
        val = h["quantity"] * h["buy_price"]
        asset_breakdown[h["asset_class"]] = asset_breakdown.get(h["asset_class"], 0.0) + val

    risk_info = calculate_portfolio_risk_score(holdings)
    overlap_info = calculate_portfolio_overlap([
        {"symbol": h["symbol"], "value": h["quantity"] * h["buy_price"]}
        for h in holdings if h["asset_class"] == "MUTUAL_FUND"
    ])

    report = "### Portfolio Advisor Report (Offline Rule-Based Mode)\n\n"
    report += f"**Overall Risk Classification**: `{risk_info['classification']} Risk` (Score: {risk_info['risk_score']}/100)\n\n"
    
    report += "#### Asset Allocation Review\n"
    for ac, val in asset_breakdown.items():
        pct = (val / total_invested) * 100
        report += f"- **{ac}**: {pct:.1f}% of portfolio\n"
    
    report += "\n#### Key Advisory Analysis\n"
    
    # Check diversification
    stocks_pct = (asset_breakdown.get("STOCK", 0.0) / total_invested) * 100
    mfs_pct = (asset_breakdown.get("MUTUAL_FUND", 0.0) / total_invested) * 100
    gold_pct = (asset_breakdown.get("GOLD_ETF", 0.0) / total_invested) * 100
    cash_pct = (asset_breakdown.get("CASH", 0.0) / total_invested) * 100

    if stocks_pct > 70:
        report += "- ⚠️ **High Equity Concentration**: Direct stocks exceed 70% of your holdings. This leads to higher volatility. Consider increasing Mutual Funds or Gold ETFs to add stability.\n"
    elif stocks_pct < 20 and mfs_pct < 20:
        report += "- ⚠️ **Low Equity Exposure**: Equities are underrepresented. For long-term wealth creation, you may want to increase systematic equity exposure through index ETFs or bluechip mutual funds.\n"
    else:
        report += "- 🟢 **Good Allocation Balance**: Stable balance between direct equities and mutual funds.\n"

    # Gold Allocation
    if gold_pct < 5:
        report += "- 💡 **Hedging Recommendation**: Gold allocation is below 5%. Maintaining a 5-10% hedge in Gold ETFs is recommended to shelter against market corrections.\n"
    elif gold_pct > 20:
        report += "- ⚠️ **High Gold Allocation**: Gold exceeds 20% of your holdings. While safe, gold can underperform equities over the long term. Consider rebalancing towards growth assets.\n"

    # Mutual Fund Overlap warnings
    if overlap_info.get("warnings"):
        report += "\n#### Mutual Fund Overlap Warning\n"
        for w in overlap_info["warnings"]:
            report += f"- {w}\n"

    # General disclaimers (Strict guidelines)
    report += (
        "\n---\n"
        "*Disclaimer: This offline analysis is rule-based and does not constitute formal financial planning advice. "
        "Past performance is not indicative of future returns. Market investments are subject to market risks.*"
    )
    
    return report

def ask_ai_advisor(message: str, holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Orchestrates the AI advisory chat using a multi-tiered response engine.
    """
    portfolio_ctx = get_portfolio_context_summary(holdings)
    
    system_prompt = (
        "You are 'Antigravity Advisor', an elite AI financial advisory bot tailored for Indian investors. "
        "Your mission is to provide secure, evidence-based, and objective investment insights focusing on long-term wealth creation, "
        "portfolio diversification, asset allocation, and risk management.\n\n"
        "STRICT ADVISORY GUIDELINES:\n"
        "1. Never guarantee returns or project specific numbers with absolute certainty.\n"
        "2. Never claim certainty about future market directions (e.g. use terms like 'may correct', 'potential upside', 'historical trends suggest').\n"
        "3. Emphasize risk control, asset diversification (Equities, MFs, Gold, Cash), and SIP continuity.\n"
        "4. Reference Indian market benchmarks (Nifty 50, Nifty 500, India VIX) where appropriate.\n"
        "5. Be concise and write in a clean, professional, markdown format.\n\n"
        f"USER'S PORTFOLIO CONTEXT:\n{portfolio_ctx}"
    )

    # Tier 1: Try Gemini API if key is available
    if GEMINI_API_KEY:
        try:
            # We call Gemini API via direct HTTP POST to avoid requiring heavy sdk if not present
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": f"{system_prompt}\n\nUser Question: {message}"}
                        ]
                    }
                ]
            }
            res = requests.post(url, json=payload, headers=headers, timeout=12)
            if res.status_code == 200:
                data = res.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return {
                    "response": text,
                    "source": "Gemini API (Free Tier)"
                }
        except Exception as e:
            # Fall through on connection error
            pass

    # Tier 2: Try Pollinations AI (Zero-key serverless API)
    try:
        url = "https://text.pollinations.ai/"
        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message}
            ],
            "model": "openai",
            "jsonMode": False
        }
        res = requests.post(url, json=payload, timeout=12)
        if res.status_code == 200:
            return {
                "response": res.text,
                "source": "Pollinations AI (Free serverless LLM)"
            }
    except Exception as e:
        # Fall through on error
        pass

    # Tier 3: Offline Expert System Fallback
    local_report = generate_local_expert_advice(message, holdings)
    return {
        "response": local_report,
        "source": "Local Expert System (Offline)"
    }
