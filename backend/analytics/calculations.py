from datetime import date, datetime
from typing import List, Tuple

def calculate_cagr(invested: float, current: float, years: float) -> float:
    """
    Calculates Compound Annual Growth Rate (CAGR).
    CAGR = (Current / Invested) ** (1 / years) - 1
    Prevent annualizing for periods less than 1 year (cap years at min 1.0).
    """
    if invested <= 0 or current < 0 or years <= 0:
        return 0.0
    try:
        cagr_years = max(1.0, years)
        return (current / invested) ** (1.0 / cagr_years) - 1.0
    except ZeroDivisionError:
        return 0.0

def calculate_xirr(cash_flows: List[Tuple[date, float]], guess: float = 0.1) -> float:
    """
    Calculates the Extended Internal Rate of Return (XIRR) using the Newton-Raphson method.
    cash_flows: List of tuples (date, amount).
                Investments should be negative, returns/current value positive.
    """
    if len(cash_flows) < 2:
        return 0.0

    # Sort cash flows chronologically
    sorted_flows = sorted(cash_flows, key=lambda x: x[0])
    t0 = sorted_flows[0][0]

    # Convert dates to time fractions in years from the first date
    flow_years = []
    amounts = []
    for d, amt in sorted_flows:
        years = (d - t0).days / 365.0
        flow_years.append(years)
        amounts.append(amt)

    # Check if we have both positive and negative cash flows
    has_negative = any(x < 0 for x in amounts)
    has_positive = any(x > 0 for x in amounts)
    if not (has_negative and has_positive):
        return 0.0

    # Fallback to simple return if the total duration is less than 180 days
    total_days = (sorted_flows[-1][0] - sorted_flows[0][0]).days
    if total_days < 180:
        total_invested = sum(-x for x in amounts if x < 0)
        current_value = sum(x for x in amounts if x > 0)
        if total_invested > 0:
            return (current_value - total_invested) / total_invested
        return 0.0

    # Newton-Raphson iteration
    r = guess
    max_iterations = 100
    tolerance = 1e-6

    for _ in range(max_iterations):
        npv = 0.0
        d_npv = 0.0  # derivative of NPV w.r.t rate r

        for t, amt in zip(flow_years, amounts):
            # NPV term: amt / (1 + r)^t
            factor = (1.0 + r) ** t
            if abs(factor) < 1e-12:
                # Avoid division by zero
                return 0.0
            npv += amt / factor
            
            # Derivative term: -t * amt / (1 + r)^(t + 1)
            d_factor = (1.0 + r) ** (t + 1.0)
            if abs(d_factor) > 1e-12:
                d_npv -= t * amt / d_factor

        if abs(d_npv) < 1e-12:
            break

        next_r = r - npv / d_npv
        
        # Limit rate jump to avoid wild oscillations
        if abs(next_r - r) > 0.5:
            # Dampen the jump
            next_r = r + 0.1 if next_r > r else r - 0.1

        if abs(next_r - r) < tolerance:
            return next_r

        r = next_r

    # If it failed to converge, try alternate guesses
    if abs(npv) > tolerance:
        alternate_guesses = [-0.2, -0.05, 0.0, 0.2, 0.4, 0.8]
        for alt in alternate_guesses:
            r = alt
            for _ in range(30):
                npv = 0.0
                d_npv = 0.0
                for t, amt in zip(flow_years, amounts):
                    factor = (1.0 + r) ** t
                    if abs(factor) < 1e-12:
                        continue
                    npv += amt / factor
                    d_factor = (1.0 + r) ** (t + 1.0)
                    if abs(d_factor) > 1e-12:
                        d_npv -= t * amt / d_factor
                if abs(d_npv) < 1e-12:
                    break
                next_r = r - npv / d_npv
                if abs(next_r - r) < tolerance:
                    return next_r
                r = next_r

    # Fallback to simple CAGR if solver fails to converge
    total_invested = sum(-x for x in amounts if x < 0)
    current_value = sum(x for x in amounts if x > 0)
    max_days = max(flow_years) if flow_years else 0.0
    if total_invested > 0 and current_value > 0 and max_days > 0:
        return calculate_cagr(total_invested, current_value, max_days)

    return 0.0
