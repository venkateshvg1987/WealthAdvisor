from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import date, datetime

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    role: str

class TokenData(BaseModel):
    email: Optional[str] = None

# User Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

# Portfolio Item Schemas
class PortfolioItemCreate(BaseModel):
    asset_class: str = Field(..., description="STOCK, MUTUAL_FUND, ETF, GOLD_ETF, CASH")
    symbol: str = Field(..., description="NSE/BSE ticker or Mutual Fund Scheme code")
    name: str
    quantity: float
    buy_price: float
    buy_date: date

class PortfolioItemResponse(BaseModel):
    id: int
    user_id: int
    asset_class: str
    symbol: str
    name: str
    quantity: float
    buy_price: float
    buy_date: date
    created_at: datetime

    class Config:
        from_attributes = True

# Advisory Chat Schemas
class AdvisoryRequest(BaseModel):
    message: str

class AdvisoryResponse(BaseModel):
    response: str
    source: str  # pollinations, gemini, or offline_rules
