from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from typing import List, Optional
import io
import json

from backend.database import engine, Base, get_db
from backend.config import AI_PROVIDER
from backend import models, schemas, auth, backups, mock_data
from backend.analytics import calculations
from backend.analytics.stocks import analyze_stock, run_stock_scanner
from backend.analytics.mutual_funds import analyze_mutual_fund, check_sip_health, calculate_portfolio_overlap
from backend.analytics.etfs import analyze_etf
from backend.risk_engine import calculate_portfolio_risk_score, simulate_market_corrections
from backend.advisor import ask_ai_advisor
from backend.upload import parse_portfolio_file
from backend.reporting import generate_excel_report, generate_pdf_report

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Portfolio Intelligence Platform API", version="1.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup routine: Seed market cache & default user
@app.on_event("startup")
def startup_db_setup():
    db = next(get_db())
    try:
        # 1. Create default user if not exists
        default_email = "investor@platform.in"
        exists = db.query(models.User).filter(models.User.email == default_email).first()
        if not exists:
            hashed_pwd = auth.get_password_hash("investor123")
            user = models.User(email=default_email, hashed_password=hashed_pwd, role="investor")
            db.add(user)
            db.commit()
            print(f"Default user seeded: {default_email} / investor123")

        # 2. Seed market cache if empty
        cache_count = db.query(models.MarketDataCache).count()
        if cache_count == 0:
            # Seed Stocks
            for sym, data in mock_data.MOCK_STOCKS.items():
                cache = models.MarketDataCache(
                    symbol=sym,
                    asset_class="STOCK",
                    name=data["name"],
                    price=data["price"],
                    fundamentals_json=json.dumps(data["fundamentals"]),
                    technicals_json=json.dumps(data["technicals"]),
                    risk_metrics_json=json.dumps({"sector": data["sector"]})
                )
                db.add(cache)
            # Seed Mutual Funds
            for sym, data in mock_data.MOCK_MUTUAL_FUNDS.items():
                cache = models.MarketDataCache(
                    symbol=sym,
                    asset_class="MUTUAL_FUND",
                    name=data["name"],
                    price=data["price"],
                    risk_metrics_json=json.dumps(data["metrics"]),
                    fundamentals_json=json.dumps({"top_holdings": data["top_holdings"], "category": data["category"]})
                )
                db.add(cache)
            # Seed ETFs
            for sym, data in mock_data.MOCK_ETFS.items():
                cache = models.MarketDataCache(
                    symbol=sym,
                    asset_class="ETF",
                    name=data["name"],
                    price=data["price"],
                    risk_metrics_json=json.dumps(data["metrics"]),
                    fundamentals_json=json.dumps({"category": data["category"]})
                )
                db.add(cache)
            
            db.commit()
            print("Market data cache pre-seeded successfully.")
    except Exception as e:
        print(f"Startup seeding error: {str(e)}")
    finally:
        db.close()

# API Rate Limiter implementation
rate_limit_db = {} # Simple in-memory rate limiter: IP -> [timestamps]
def enforce_rate_limit(ip_address: str):
    now = datetime.now()
    window_start = now - timedelta(seconds=60)
    
    # Filter requests in the current window
    timestamps = rate_limit_db.get(ip_address, [])
    timestamps = [t for t in timestamps if t > window_start]
    
    if len(timestamps) >= 100: # 100 requests per minute
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Maximum 100 requests per minute allowed."
        )
    timestamps.append(now)
    rate_limit_db[ip_address] = timestamps

# --- AUTH ENDPOINTS ---

@app.post("/api/auth/register", response_model=schemas.UserResponse)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    exists = db.query(models.User).filter(models.User.email == user_in.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="User with this email already exists.")
    
    hashed_pwd = auth.get_password_hash(user_in.password)
    user = models.User(email=user_in.email, hashed_password=hashed_pwd, role="investor")
    db.add(user)
    db.commit()
    db.refresh(user)
    
    auth.log_audit(db, user.id, "USER_REGISTER", f"Registered new user: {user.email}")
    return user

@app.post("/api/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        auth.log_audit(db, None, "AUTH_LOGIN_FAILED", f"Failed login attempt for username: {form_data.username}")
        raise HTTPException(status_code=400, detail="Incorrect email or password")
        
    access_token = auth.create_access_token(data={"sub": user.email})
    auth.log_audit(db, user.id, "AUTH_LOGIN_SUCCESS", f"User logged in successfully: {user.email}")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role
    }

# --- HOLDINGS CRUD ---

@app.get("/api/portfolio/holdings", response_model=List[schemas.PortfolioItemResponse])
def get_holdings(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    return db.query(models.PortfolioItem).filter(models.PortfolioItem.user_id == current_user.id).all()

@app.post("/api/portfolio/holdings", response_model=schemas.PortfolioItemResponse)
def add_holding(item: schemas.PortfolioItemCreate, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    # Standardize inputs
    symbol = item.symbol.upper().strip()
    
    holding = models.PortfolioItem(
        user_id=current_user.id,
        asset_class=item.asset_class.upper(),
        symbol=symbol,
        name=item.name,
        quantity=item.quantity,
        buy_price=item.buy_price,
        buy_date=item.buy_date
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)
    
    auth.log_audit(db, current_user.id, "ADD_HOLDING", f"Added holding: {symbol} (Qty: {item.quantity})")
    return holding

@app.delete("/api/portfolio/holdings/{holding_id}")
def delete_holding(holding_id: int, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holding = db.query(models.PortfolioItem).filter(
        models.PortfolioItem.id == holding_id,
        models.PortfolioItem.user_id == current_user.id
    ).first()
    
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
        
    symbol = holding.symbol
    db.delete(holding)
    db.commit()
    
    auth.log_audit(db, current_user.id, "DELETE_HOLDING", f"Deleted holding: {symbol}")
    return {"message": "Holding deleted successfully"}

# Bulk Upload Excel/CSV
@app.post("/api/portfolio/upload")
async def upload_portfolio(
    file: UploadFile = File(...),
    asset_class: str = Query("STOCK", description="STOCK, MUTUAL_FUND, ETF, GOLD_ETF, CASH"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Enforce size limit (5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size allowed is 5MB.")

    try:
        items = parse_portfolio_file(content, file.filename, asset_class)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    uploaded_count = 0
    for it in items:
        # Check if cache has name info
        cache = db.query(models.MarketDataCache).filter(models.MarketDataCache.symbol == it["symbol"]).first()
        name = cache.name if cache else it["name"]

        holding = models.PortfolioItem(
            user_id=current_user.id,
            asset_class=it["asset_class"],
            symbol=it["symbol"],
            name=name,
            quantity=it["quantity"],
            buy_price=it["buy_price"],
            buy_date=it["buy_date"]
        )
        db.add(holding)
        uploaded_count += 1
        
    db.commit()
    auth.log_audit(
        db, current_user.id, "UPLOAD_PORTFOLIO", 
        f"Uploaded file {file.filename} containing {uploaded_count} transactions."
    )
    
    return {"message": f"Successfully imported {uploaded_count} items."}

# --- ANALYTICS SUMMARIES ---

@app.get("/api/portfolio/summary")
def get_portfolio_summary(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(models.PortfolioItem).filter(models.PortfolioItem.user_id == current_user.id).all()
    
    if not holdings:
        return {
            "total_invested": 0.0,
            "current_value": 0.0,
            "total_gains": 0.0,
            "percentage_gains": 0.0,
            "cagr": 0.0,
            "xirr": 0.0,
            "health_score": 100,
            "risk_score": 0.0,
            "risk_classification": "Low",
            "asset_allocation": {},
            "sector_allocation": {}
        }

    # Fetch prices from cache to compute current valuations
    prices = {c.symbol: c.price for c in db.query(models.MarketDataCache).all()}
    
    total_invested = 0.0
    current_value = 0.0
    
    asset_alloc = {}
    sector_alloc = {}
    cash_flows = []
    
    # Track timeframe for CAGR
    min_date = date.today()
    
    for h in holdings:
        cost = h.quantity * h.buy_price
        # Pull current price from cache, fallback to buy price if ticker is unknown
        curr_price = prices.get(h.symbol, h.buy_price)
        curr_val = h.quantity * curr_price
        
        total_invested += cost
        current_value += curr_val
        
        # Chronology check
        if h.buy_date < min_date:
            min_date = h.buy_date
            
        # Group allocations
        asset_alloc[h.asset_class] = asset_alloc.get(h.asset_class, 0.0) + curr_val
        
        # Sector allocations (direct stocks & underlying MF assets fallback)
        sector = "Liquid Asset"
        if h.asset_class == "STOCK" and h.symbol in mock_data.MOCK_STOCKS:
            sector = mock_data.MOCK_STOCKS[h.symbol]["sector"]
        elif h.asset_class == "MUTUAL_FUND":
            sector = "Diversified Mutual Fund"
        elif h.asset_class in ["ETF", "GOLD_ETF"]:
            sector = "Index ETF / Commodities"
            
        sector_alloc[sector] = sector_alloc.get(sector, 0.0) + curr_val
        
        # Append Buy cash flow (negative)
        cash_flows.append((h.buy_date, -cost))

    # Append Current Value cash flow (positive) on current date
    cash_flows.append((date.today(), current_value))

    total_gains = current_value - total_invested
    pct_gains = (total_gains / total_invested) * 100 if total_invested > 0 else 0.0
    
    # Calculate CAGR
    days_diff = (date.today() - min_date).days
    years = max(0.01, days_diff / 365.0)
    cagr = calculations.calculate_cagr(total_invested, current_value, years)

    # Calculate XIRR
    xirr = calculations.calculate_xirr(cash_flows)
    
    # Risk and Health Score
    risk_info = calculate_portfolio_risk_score([
        {"asset_class": h.asset_class, "symbol": h.symbol, "quantity": h.quantity, "buy_price": h.buy_price}
        for h in holdings
    ])
    
    # Portfolio Health Score calculation (starts at 100, drops on key risks)
    health = 100
    
    # Risk points deduction
    if risk_info["risk_score"] > 70:
        health -= 15 # Over-exposed risk profile
    elif risk_info["risk_score"] > 55:
        health -= 8
        
    # Concentration deduction
    # Deduct points if any single asset class has > 80% weight (excluding cash/Mfs)
    for ac, val in asset_alloc.items():
        weight = (val / current_value) * 100
        if ac in ["STOCK"] and weight > 60:
            health -= 10
            
    # Mutual fund overlap deduction
    overlap_info = calculate_portfolio_overlap([
        {"symbol": h.symbol, "value": h.quantity * h.buy_price}
        for h in holdings if h.asset_class == "MUTUAL_FUND"
    ])
    for p in overlap_info["pairwise_overlap"]:
        if p["overlap_percentage"] > 40.0:
            health -= 10
            break

    # Save portfolio history snapshot
    try:
        today_hist = db.query(models.PortfolioHistory).filter(
            models.PortfolioHistory.user_id == current_user.id,
            models.PortfolioHistory.date == date.today()
        ).first()
        if not today_hist:
            snap = models.PortfolioHistory(
                user_id=current_user.id,
                date=date.today(),
                total_invested=total_invested,
                current_value=current_value,
                gains=total_gains,
                cagr=cagr,
                xirr=xirr
            )
            db.add(snap)
            db.commit()
    except Exception:
        pass # Silently proceed if snapshot saving errors out

    return {
        "total_invested": round(total_invested, 2),
        "current_value": round(current_value, 2),
        "total_gains": round(total_gains, 2),
        "percentage_gains": round(pct_gains, 2),
        "cagr": round(cagr * 100, 2),
        "xirr": round(xirr * 100, 2),
        "health_score": max(20, health),
        "risk_score": risk_info["risk_score"],
        "risk_classification": risk_info["classification"],
        "asset_allocation": {k: round(v, 2) for k, v in asset_alloc.items()},
        "sector_allocation": {k: round(v, 2) for k, v in sector_alloc.items()}
    }

# --- COMPONENT SPECIFIC ANALYTICS ---

@app.get("/api/portfolio/stocks")
def get_stocks_analytics(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(models.PortfolioItem).filter(
        models.PortfolioItem.user_id == current_user.id,
        models.PortfolioItem.asset_class == "STOCK"
    ).all()
    
    analyzed = []
    for h in holdings:
        stock_seed = mock_data.MOCK_STOCKS.get(h.symbol)
        if stock_seed:
            res = analyze_stock(h.symbol, stock_seed)
        else:
            # Fallback for stocks not in our primary mock seed list
            default_seed = {
                "name": h.name,
                "price": h.buy_price,
                "fundamentals": {"pe": 20, "pb": 2.0, "roe": 15.0, "roce": 15.0, "debt_to_equity": 0.2, "revenue_growth": 10.0, "eps_growth": 10.0, "promoter_holding": 55.0, "institutional_holding": 20.0},
                "technicals": {"ema20": h.buy_price, "ema50": h.buy_price, "ema200": h.buy_price, "rsi": 50, "macd": "Neutral", "adx": 20, "volume_breakout": 1.0},
                "sector": "General Industrials"
            }
            res = analyze_stock(h.symbol, default_seed)
        
        # Add local holding details
        res["quantity"] = h.quantity
        res["invested"] = h.quantity * h.buy_price
        analyzed.append(res)

    alerts = run_stock_scanner(mock_data.MOCK_STOCKS)
    return {
        "holdings_analysis": analyzed,
        "scans": alerts
    }

@app.get("/api/portfolio/mutual_funds")
def get_mutual_funds_analytics(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(models.PortfolioItem).filter(
        models.PortfolioItem.user_id == current_user.id,
        models.PortfolioItem.asset_class == "MUTUAL_FUND"
    ).all()
    
    analyzed = []
    for h in holdings:
        fund_seed = mock_data.MOCK_MUTUAL_FUNDS.get(h.symbol)
        if fund_seed:
            res = analyze_mutual_fund(h.symbol, fund_seed)
        else:
            # Fallback
            default_seed = {
                "name": h.name,
                "price": h.buy_price,
                "metrics": {"sharpe_ratio": 1.0, "alpha": 0.5, "beta": 1.0, "rolling_returns_3y": 14.0, "downside_risk": 4.0, "expense_ratio": 0.7, "benchmark": "Nifty 50 TRI", "category_avg_sharpe": 1.0, "category_avg_return": 13.5},
                "top_holdings": {},
                "category": "Equity Large Cap"
            }
            res = analyze_mutual_fund(h.symbol, default_seed)
            
        # Add holdings calculations
        res["quantity"] = h.quantity
        res["invested"] = h.quantity * h.buy_price
        
        # Check mock SIP health
        txs = [{"quantity": h.quantity, "price": h.buy_price, "date": h.buy_date}]
        current_val = h.quantity * (fund_seed["price"] if fund_seed else h.buy_price)
        res["sip_health"] = check_sip_health(txs, current_val)
        
        analyzed.append(res)
        
    # Portfolio Overlap matrix
    overlap = calculate_portfolio_overlap([
        {"symbol": h.symbol, "value": h.quantity * h.buy_price}
        for h in holdings
    ])
    
    return {
        "holdings_analysis": analyzed,
        "overlap_matrix": overlap
    }

@app.get("/api/portfolio/etfs")
def get_etfs_analytics(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(models.PortfolioItem).filter(
        models.PortfolioItem.user_id == current_user.id,
        models.PortfolioItem.asset_class.in_(["ETF", "GOLD_ETF"])
    ).all()
    
    analyzed = []
    for h in holdings:
        etf_seed = mock_data.MOCK_ETFS.get(h.symbol)
        if etf_seed:
            res = analyze_etf(h.symbol, etf_seed)
        else:
            # Fallback
            default_seed = {
                "name": h.name,
                "price": h.buy_price,
                "metrics": {"tracking_error": 0.05, "expense_ratio": 0.1, "liquidity": "High", "category_avg_te": 0.06, "category_avg_er": 0.15},
                "category": "Equity Index"
            }
            res = analyze_etf(h.symbol, default_seed)
            
        res["quantity"] = h.quantity
        res["invested"] = h.quantity * h.buy_price
        analyzed.append(res)
        
    return analyzed

@app.get("/api/portfolio/risk")
def get_risk_analysis(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(models.PortfolioItem).filter(models.PortfolioItem.user_id == current_user.id).all()
    
    holding_dicts = [
        {"asset_class": h.asset_class, "symbol": h.symbol, "quantity": h.quantity, "buy_price": h.buy_price}
        for h in holdings
    ]
    
    risk_score = calculate_portfolio_risk_score(holding_dicts)
    shocks = simulate_market_corrections(holding_dicts)
    
    return {
        "market_indicators": mock_data.MOCK_RISK_INDICATORS,
        "risk_evaluation": risk_score,
        "stress_tests": shocks
    }

# --- AI ADVISOR ENDPOINT ---

@app.post("/api/portfolio/advisor", response_model=schemas.AdvisoryResponse)
def call_advisor(req: schemas.AdvisoryRequest, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(models.PortfolioItem).filter(models.PortfolioItem.user_id == current_user.id).all()
    holding_dicts = [
        {"asset_class": h.asset_class, "symbol": h.symbol, "quantity": h.quantity, "buy_price": h.buy_price}
        for h in holdings
    ]
    
    res = ask_ai_advisor(req.message, holding_dicts)
    return res

# --- REPORT DOWNLOADS ---

@app.get("/api/portfolio/report/excel")
def download_excel(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(models.PortfolioItem).filter(models.PortfolioItem.user_id == current_user.id).all()
    if not holdings:
        raise HTTPException(status_code=400, detail="Cannot generate report for an empty portfolio.")
        
    holding_dicts = [
        {"asset_class": h.asset_class, "symbol": h.symbol, "name": h.name, "quantity": h.quantity, "buy_price": h.buy_price, "buy_date": h.buy_date}
        for h in holdings
    ]
    
    excel_bytes = generate_excel_report(holding_dicts)
    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=portfolio_report.xlsx"}
    )

@app.get("/api/portfolio/report/pdf")
def download_pdf(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    holdings = db.query(models.PortfolioItem).filter(models.PortfolioItem.user_id == current_user.id).all()
    if not holdings:
        raise HTTPException(status_code=400, detail="Cannot generate report for an empty portfolio.")
        
    holding_dicts = [
        {"asset_class": h.asset_class, "symbol": h.symbol, "name": h.name, "quantity": h.quantity, "buy_price": h.buy_price, "buy_date": h.buy_date}
        for h in holdings
    ]
    
    pdf_bytes = generate_pdf_report(holding_dicts)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=portfolio_report.pdf"}
    )

# --- BACKUP MANAGEMENT ---

@app.post("/api/portfolio/backup")
def trigger_backup(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    # Check permissions
    if current_user.role != "admin" and current_user.role != "investor":
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    result = backups.run_backup(db)
    return {"message": result}

# --- AUDIT LOGS ---

@app.get("/api/portfolio/audit_logs")
def get_audit_logs(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    # Limit logs to last 50 entries
    return db.query(models.AuditLog).filter(
        models.AuditLog.user_id == current_user.id
    ).order_by(models.AuditLog.timestamp.desc()).limit(50).all()
