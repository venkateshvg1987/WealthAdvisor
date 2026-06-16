import io
import pandas as pd
from datetime import date
from typing import List, Dict, Any
from backend.mock_data import MOCK_STOCKS, MOCK_MUTUAL_FUNDS, MOCK_ETFS
from backend.analytics.stocks import analyze_stock
from backend.analytics.mutual_funds import analyze_mutual_fund
from backend.analytics.etfs import analyze_etf
from backend.risk_engine import calculate_portfolio_risk_score, simulate_market_corrections

# Try-except block for fpdf2 to avoid crash if compilation/import issues occur
try:
    from fpdf import FPDF
    FPDF_AVAILABLE = True
except ImportError:
    FPDF_AVAILABLE = False

# PDF Generator Class
if FPDF_AVAILABLE:
    class PortfolioPDF(FPDF):
        def header(self):
            # Page Title / Header
            self.set_font("Helvetica", "B", 10)
            self.set_text_color(100, 110, 120)
            self.cell(0, 10, "Portfolio Intelligence Platform - Confidential Report", border=0, ln=1, align="R")
            self.line(10, 18, 200, 18)
            self.ln(5)

        def footer(self):
            # Page Number / Footer
            self.set_y(-15)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"Page {self.page_no()} | Generated on {date.today().strftime('%B %d, %Y')} | Undergoing Market Risks", border=0, align="C")

def generate_excel_report(holdings: List[Dict[str, Any]]) -> bytes:
    """
    Creates a multi-tab Excel report containing details of the portfolio.
    """
    output = io.BytesIO()
    
    # 1. Summary DataFrame
    total_invested = sum(h["quantity"] * h["buy_price"] for h in holdings)
    risk_info = calculate_portfolio_risk_score(holdings)
    
    summary_data = {
        "Metric": [
            "Report Generation Date",
            "Total Holdings Count",
            "Total Invested capital",
            "Portfolio Risk Score",
            "Risk Classification"
        ],
        "Value": [
            date.today().strftime("%Y-%m-%d"),
            len(holdings),
            f"INR {total_invested:,.2f}",
            risk_info["risk_score"],
            risk_info["classification"]
        ]
    }
    df_summary = pd.DataFrame(summary_data)
    
    # 2. Holdings DataFrame
    holdings_rows = []
    for h in holdings:
        val = h["quantity"] * h["buy_price"]
        rec = "Hold"
        
        # Pull mock recommendations to add premium details to the sheet
        ac = h["asset_class"].upper()
        sym = h["symbol"]
        if ac == "STOCK" and sym in MOCK_STOCKS:
            rec = analyze_stock(sym, MOCK_STOCKS[sym])["recommendation"]
        elif ac == "MUTUAL_FUND" and sym in MOCK_MUTUAL_FUNDS:
            rec = analyze_mutual_fund(sym, MOCK_MUTUAL_FUNDS[sym])["recommendation"]
        elif ac in ["ETF", "GOLD_ETF"] and sym in MOCK_ETFS:
            rec = analyze_etf(sym, MOCK_ETFS[sym])["recommendation"]

        holdings_rows.append({
            "Asset Class": h["asset_class"],
            "Symbol": h["symbol"],
            "Name": h["name"],
            "Quantity": h["quantity"],
            "Buy Price": h["buy_price"],
            "Total Value": val,
            "Purchase Date": str(h["buy_date"]),
            "AI Recommendation": rec
        })
    df_holdings = pd.DataFrame(holdings_rows)

    # 3. Stress Test DataFrame
    stress_results = simulate_market_corrections(holdings)
    stress_rows = []
    for shock in [10, 20, 30, 40]:
        res = stress_results.get(f"shock_{shock}", {})
        stress_rows.append({
            "Market Shock (%)": f"-{shock}% Correction",
            "Simulated Portfolio Value": res.get("simulated_value", 0.0),
            "Estimated Value Loss": res.get("total_loss", 0.0),
            "Percentage Loss (%)": f"-{res.get('percentage_loss', 0.0):.2f}%"
        })
    df_stress = pd.DataFrame(stress_rows)

    # Write to ExcelWriter
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df_summary.to_excel(writer, sheet_name="Overview", index=False)
        df_holdings.to_excel(writer, sheet_name="Holdings", index=False)
        df_stress.to_excel(writer, sheet_name="Stress Analysis", index=False)
        
    return output.getvalue()

def generate_pdf_report(holdings: List[Dict[str, Any]]) -> bytes:
    """
    Creates a styled PDF report summarizing portfolio status and health.
    """
    if not FPDF_AVAILABLE:
        # Fallback if fpdf2 is not available
        fallback_text = "PDF Generation Error: FPDF2 package is not installed."
        return fallback_text.encode()

    pdf = PortfolioPDF()
    pdf.add_page()
    
    # Theme color definitions (Slate blue branding)
    r_brand, g_brand, b_brand = 30, 41, 59 # Slate
    
    # 1. Document Title
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(r_brand, g_brand, b_brand)
    pdf.cell(0, 15, "Portfolio Intelligence Report", border=0, ln=1, align="L")
    
    # Date
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(110, 110, 110)
    pdf.cell(0, 5, f"Date: {date.today().strftime('%B %d, %Y')} | For Indian Markets", border=0, ln=1, align="L")
    pdf.ln(10)
    
    # Core calculations
    total_invested = sum(h["quantity"] * h["buy_price"] for h in holdings)
    risk_info = calculate_portfolio_risk_score(holdings)
    
    # 2. Executive Summary Block
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(r_brand, g_brand, b_brand)
    pdf.cell(0, 8, "1. Executive Summary", border=0, ln=1)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(50, 50, 50)
    pdf.write(5, f"This document contains the structural analysis of your investment portfolio. "
                 f"The portfolio comprises {len(holdings)} holdings across multiple asset classes with a total cost-basis "
                 f"capital allocation of ")
    pdf.set_font("Helvetica", "B", 10)
    pdf.write(5, f"INR {total_invested:,.2f}.\n\n")
    
    # Metrics Table Grid
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(240, 243, 246)
    pdf.cell(90, 7, "Parameter", border=1, align="L", fill=True)
    pdf.cell(100, 7, "Value", border=1, align="L", fill=True)
    pdf.ln()
    
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(90, 7, "Total Investment", border=1)
    pdf.cell(100, 7, f"INR {total_invested:,.2f}", border=1)
    pdf.ln()
    pdf.cell(90, 7, "Risk Index Rating", border=1)
    pdf.cell(100, 7, f"{risk_info['risk_score']} / 100", border=1)
    pdf.ln()
    pdf.cell(90, 7, "Risk Classification Grade", border=1)
    pdf.cell(100, 7, f"{risk_info['classification']} Risk", border=1)
    pdf.ln()
    pdf.ln(8)

    # 3. Asset Allocation
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(r_brand, g_brand, b_brand)
    pdf.cell(0, 8, "2. Asset Allocation Breakdown", border=0, ln=1)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    
    # Group by asset class
    ac_vals = {}
    for h in holdings:
        ac_vals[h["asset_class"]] = ac_vals.get(h["asset_class"], 0.0) + (h["quantity"] * h["buy_price"])
        
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(240, 243, 246)
    pdf.cell(60, 7, "Asset Class", border=1, fill=True)
    pdf.cell(70, 7, "Invested Amount", border=1, fill=True)
    pdf.cell(60, 7, "Allocation Percentage", border=1, fill=True)
    pdf.ln()
    
    pdf.set_font("Helvetica", "", 10)
    for ac, val in ac_vals.items():
        pct = (val / total_invested) * 100 if total_invested > 0 else 0
        pdf.cell(60, 7, str(ac), border=1)
        pdf.cell(70, 7, f"INR {val:,.2f}", border=1)
        pdf.cell(60, 7, f"{pct:.2f}%", border=1)
        pdf.ln()
    pdf.ln(8)

    # 4. Stress Test Scenario Table
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(r_brand, g_brand, b_brand)
    pdf.cell(0, 8, "3. Stress Testing Scenario Simulations", border=0, ln=1)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    
    stress_results = simulate_market_corrections(holdings)
    
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_fill_color(240, 243, 246)
    pdf.cell(50, 7, "Correction Level", border=1, fill=True)
    pdf.cell(70, 7, "Simulated Portfolio Value", border=1, fill=True)
    pdf.cell(70, 7, "Estimated Capital Impact", border=1, fill=True)
    pdf.ln()
    
    pdf.set_font("Helvetica", "", 10)
    for shock in [10, 20, 30, 40]:
        res = stress_results.get(f"shock_{shock}", {})
        pdf.cell(50, 7, f"-{shock}% Market Correction", border=1)
        pdf.cell(70, 7, f"INR {res.get('simulated_value', 0.0):,.2f}", border=1)
        pdf.cell(70, 7, f"-INR {res.get('total_loss', 0.0):,.2f} (-{res.get('percentage_loss', 0.0):.1f}%)", border=1)
        pdf.ln()
        
    pdf.ln(10)
    
    # 5. Advisory Disclaimer block
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(0, 4.5, "Important Advisory: Mutual Fund and direct equity investments are subject to market risks. "
                           "The projections and recommendations provided in this report are based on quantitative parameters, "
                           "technical moving averages, and historical valuation multiples. They do not represent a guarantee "
                           "of future performance. Investors should assess their risk tolerance prior to making allocation adjustments.")

    return pdf.output()
