from typing import Dict, List, Any

def analyze_stock(symbol: str, stock_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Performs fundamental & technical analysis and generates a recommendation,
    evidence list, and confidence score.
    """
    name = stock_data.get("name", symbol)
    price = stock_data.get("price", 0.0)
    fund = stock_data.get("fundamentals", {})
    tech = stock_data.get("technicals", {})
    sector = stock_data.get("sector", "Unknown")

    evidence_pos = []
    evidence_neg = []

    # 1. Fundamental Scoring (Max 100 points)
    fund_score = 0
    
    # PE Ratio
    pe = fund.get("pe", 0)
    if pe > 0:
        if pe < 15:
            fund_score += 15
            evidence_pos.append(f"Highly attractive valuation with low PE of {pe}")
        elif pe < 30:
            fund_score += 10
            evidence_pos.append(f"Reasonable PE ratio of {pe}")
        elif pe < 50:
            fund_score += 5
            evidence_neg.append(f"Valuation is slightly rich with PE of {pe}")
        else:
            fund_score -= 10
            evidence_neg.append(f"Expensive valuation with a very high PE of {pe}")
            
    # ROE (Return on Equity)
    roe = fund.get("roe", 0)
    if roe >= 20:
        fund_score += 20
        evidence_pos.append(f"Excellent ROE of {roe}% indicating high profitability")
    elif roe >= 15:
        fund_score += 15
        evidence_pos.append(f"Strong ROE of {roe}%")
    elif roe >= 10:
        fund_score += 5
    else:
        fund_score -= 5
        evidence_neg.append(f"Subpar ROE of {roe}% (below 10% threshold)")

    # ROCE (Return on Capital Employed)
    roce = fund.get("roce", 0)
    if roce >= 20:
        fund_score += 20
        evidence_pos.append(f"Outstanding capital efficiency with ROCE of {roce}%")
    elif roce >= 15:
        fund_score += 15
        evidence_pos.append(f"Good ROCE of {roce}%")
    elif roce < 10:
        fund_score -= 5
        evidence_neg.append(f"Poor capital efficiency: ROCE is low at {roce}%")

    # Debt-to-Equity
    de = fund.get("debt_to_equity", 0)
    # Exclude financial sector from strict low D/E penalization
    is_finance = sector == "Financial Services"
    if is_finance:
        if de <= 1.0:
            fund_score += 15
            evidence_pos.append(f"Conservative bank leverage (D/E: {de})")
        else:
            fund_score += 10
    else:
        if de <= 0.5:
            fund_score += 15
            evidence_pos.append(f"Very healthy balance sheet with low Debt/Equity of {de}")
        elif de <= 1.0:
            fund_score += 10
            evidence_pos.append(f"Manageable Debt/Equity of {de}")
        else:
            fund_score -= 15
            evidence_neg.append(f"High leverage risk with Debt/Equity of {de}")

    # Growth (Revenue & EPS)
    rev_growth = fund.get("revenue_growth", 0)
    eps_growth = fund.get("eps_growth", 0)
    if rev_growth >= 12:
        fund_score += 10
        evidence_pos.append(f"Robust revenue growth of {rev_growth}%")
    elif rev_growth >= 6:
        fund_score += 5
    else:
        evidence_neg.append(f"Muted top-line growth of {rev_growth}%")

    if eps_growth >= 12:
        fund_score += 10
        evidence_pos.append(f"Strong EPS expansion of {eps_growth}%")
    elif eps_growth < 0:
        fund_score -= 10
        evidence_neg.append(f"Decline in earnings: EPS growth is negative ({eps_growth}%)")

    # Shareholding Patterns
    promoter = fund.get("promoter_holding", 0)
    inst = fund.get("institutional_holding", 0)
    if promoter >= 50:
        fund_score += 10
        evidence_pos.append(f"Strong skin-in-the-game (Promoter holding: {promoter}%)")
    elif promoter > 0 and promoter < 30:
        evidence_neg.append(f"Relatively low promoter stake of {promoter}%")
        
    if inst >= 20:
        fund_score += 10
        evidence_pos.append(f"Significant institutional backing (FII/DII stake: {inst}%)")

    # Standardize Fundamental Score to 0-100 scale
    final_fund_score = max(0, min(100, int((fund_score / 100) * 100)))

    # 2. Technical Scoring (Max 100 points)
    tech_score = 0
    
    # Trend Analysis (Price vs EMAs)
    ema20 = tech.get("ema20", 0)
    ema50 = tech.get("ema50", 0)
    ema200 = tech.get("ema200", 0)
    
    is_bullish_trend = price > ema20 > ema50 > ema200
    is_bearish_trend = price < ema20 < ema50 < ema200
    
    if is_bullish_trend:
        tech_score += 35
        evidence_pos.append("Bullish moving average alignment (Price > EMA20 > EMA50 > EMA200)")
    elif price > ema200:
        tech_score += 15
        evidence_pos.append("Price is trading above its long-term EMA200 anchor")
    elif is_bearish_trend:
        tech_score -= 10
        evidence_neg.append("Severely bearish trend: Price < EMA20 < EMA50 < EMA200")
    else:
        evidence_neg.append("Price undergoing consolidation below key short-term EMAs")

    # RSI (Relative Strength Index)
    rsi = tech.get("rsi", 50)
    if rsi < 30:
        tech_score += 25
        evidence_pos.append(f"RSI of {rsi} suggests deep oversold/undervalued levels ready for bounce")
    elif rsi < 40:
        tech_score += 15
        evidence_pos.append(f"RSI of {rsi} shows moderate oversold pullback")
    elif rsi > 75:
        tech_score -= 15
        evidence_neg.append(f"RSI of {rsi} indicates highly overbought momentum, elevated correction risk")
    else:
        tech_score += 10

    # MACD & ADX
    macd = tech.get("macd", "")
    adx = tech.get("adx", 0)
    if "Bullish" in macd:
        tech_score += 15
        evidence_pos.append("MACD indicator showing bullish crossover/momentum")
    elif "Bearish" in macd:
        tech_score -= 5
        evidence_neg.append("MACD indicator showing bearish crossover")

    if adx > 25:
        tech_score += 15
        if is_bullish_trend or "Bullish" in macd:
            evidence_pos.append(f"ADX of {adx} confirms strong bullish trend intensity")
        else:
            evidence_neg.append(f"ADX of {adx} confirms strong bearish trend intensity")

    # Volume Breakout
    vol_breakout = tech.get("volume_breakout", 1.0)
    if vol_breakout >= 2.0:
        tech_score += 20
        evidence_pos.append(f"Significant volume breakout detected ({vol_breakout}x avg volume)")
    elif vol_breakout >= 1.5:
        tech_score += 10

    final_tech_score = max(0, min(100, int((tech_score / 100) * 100)))

    # 3. Decision Logic & Recommendation System
    # We combine Fundamental Strength with Technical Momentum
    recommendation = "Hold"
    confidence = 50.0
    
    if final_fund_score >= 70:
        # Strong Fundamentals
        if rsi < 35 or (price < ema20 and price > ema200):
            recommendation = "Buy on Dips"
            confidence = int(final_fund_score * 0.9 + (100 - rsi) * 0.1)
        elif final_tech_score >= 60:
            recommendation = "Accumulate"
            confidence = int(final_fund_score * 0.7 + final_tech_score * 0.3)
        else:
            recommendation = "Hold"
            confidence = int((final_fund_score + final_tech_score) / 2)
    elif final_fund_score >= 50:
        # Mid Fundamentals
        if final_tech_score >= 75:
            recommendation = "Accumulate"
            confidence = 65
        elif final_tech_score < 30:
            recommendation = "Reduce"
            confidence = 70
        else:
            recommendation = "Hold"
            confidence = 60
    else:
        # Weak Fundamentals
        if final_tech_score < 40 or is_bearish_trend:
            recommendation = "Exit"
            confidence = int(85 - final_fund_score)
        else:
            recommendation = "Reduce"
            confidence = int(75 - final_fund_score)

    return {
        "symbol": symbol,
        "name": name,
        "price": price,
        "sector": sector,
        "fundamental_score": final_fund_score,
        "technical_score": final_tech_score,
        "recommendation": recommendation,
        "confidence_score": min(98, max(45, confidence)),
        "evidence_pos": evidence_pos,
        "evidence_neg": evidence_neg
    }

def run_stock_scanner(stocks_list: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Scans list of stocks daily to highlight trend changes, momentum setups, and anomalies.
    """
    alerts = []
    for sym, data in stocks_list.items():
        price = data.get("price", 0.0)
        tech = data.get("technicals", {})
        vol = tech.get("volume_breakout", 1.0)
        rsi = tech.get("rsi", 50)
        ema20 = tech.get("ema20", 0)
        
        # 1. Unusual Volume Breakout Alert
        if vol >= 2.5:
            alerts.append({
                "symbol": sym,
                "type": "Unusual Volume Breakout",
                "severity": "High",
                "description": f"{sym} trading at {vol}x normal volume. Strong institutional interest."
            })
            
        # 2. RSI Oversold (Momentum Bottom)
        if rsi <= 30:
            alerts.append({
                "symbol": sym,
                "type": "Deep Oversold (RSI)",
                "severity": "Medium",
                "description": f"{sym} RSI at {rsi}. Technically oversold; potential reversal candidate."
            })
            
        # 3. RSI Overbought (Correction Risk)
        if rsi >= 75:
            alerts.append({
                "symbol": sym,
                "type": "Deep Overbought (RSI)",
                "severity": "Medium",
                "description": f"{sym} RSI at {rsi}. Technical overbought extension; warning on fresh entries."
            })
            
        # 4. Momentum breakouts
        if vol >= 1.8 and price > ema20 and rsi > 55:
            alerts.append({
                "symbol": sym,
                "type": "Bullish Momentum Breakout",
                "severity": "High",
                "description": f"{sym} showing price/volume breakout above short term EMA20. Momentum opportunity."
            })
            
    return alerts
