import os
from cryptography.fernet import Fernet

# Security Keys
SECRET_KEY = os.getenv("JWT_SECRET", "super-secret-jwt-key-investment-tracker-12345")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days token validity

# Encryption Key for Sensitive Data
# Generate a static but secure fallback key if none is set
ENCRYPTION_KEY_RAW = os.getenv("ENCRYPTION_KEY")
if not ENCRYPTION_KEY_RAW:
    # Use a fixed key for local development consistency unless set
    ENCRYPTION_KEY_RAW = "y1c_Z_7p_pP1Zq_h6r-k6FvQ9YkQ6e0W2J2R0K3b_c4="
ENCRYPTION_KEY = ENCRYPTION_KEY_RAW.encode()

# Database Config
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./portfolio.db")

# AI Config
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# Default LLM Provider (pollinations or gemini)
AI_PROVIDER = os.getenv("AI_PROVIDER", "pollinations")

# Security and Rate Limiting
RATE_LIMIT_REQUESTS = 100  # Requests
RATE_LIMIT_WINDOW = 60      # Seconds
