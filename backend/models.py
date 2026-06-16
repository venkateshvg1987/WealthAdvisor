from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="investor") # investor, admin
    created_at = Column(DateTime, default=datetime.utcnow)

    holdings = relationship("PortfolioItem", back_populates="owner", cascade="all, delete-orphan")
    history = relationship("PortfolioHistory", back_populates="owner", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user")

class PortfolioItem(Base):
    __tablename__ = "portfolio_items"

    id = Column(Integer, primary key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    asset_class = Column(String, nullable=False)  # STOCK, MUTUAL_FUND, ETF, GOLD_ETF, CASH
    symbol = Column(String, nullable=False, index=True)  # E.g., RELIANCE, INFOSYS, HDFCBANK
    name = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    buy_price = Column(Float, nullable=False)
    buy_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="holdings")

class PortfolioHistory(Base):
    __tablename__ = "portfolio_history"

    id = Column(Integer, primary key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    total_invested = Column(Float, nullable=False)
    current_value = Column(Float, nullable=False)
    gains = Column(Float, nullable=False)
    cagr = Column(Float, nullable=True)
    xirr = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="history")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)  # e.g. UPLOAD_PORTFOLIO, EXPORT_REPORT, AUTH_LOGIN
    details = Column(Text, nullable=False)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")

class MarketDataCache(Base):
    __tablename__ = "market_data_cache"

    symbol = Column(String, primary key=True, unique=True, index=True)
    asset_class = Column(String, nullable=False)
    name = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    
    # Store fundamentals, technicals, or risk parameters as structured JSON strings
    fundamentals_json = Column(Text, nullable=True)
    technicals_json = Column(Text, nullable=True)
    risk_metrics_json = Column(Text, nullable=True)
    
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
