import io
import pandas as pd
from datetime import datetime, date
from typing import List, Dict, Any, Optional

def clean_column_name(col: str) -> str:
    """
    Standardizes column names (lowercase, strips spaces and underscores).
    """
    return str(col).strip().lower().replace(" ", "").replace("_", "").replace("-", "")

def map_headers_for_row(row_cells: List[Any]) -> Optional[Dict[str, int]]:
    """
    Checks if a row of cells maps the required portfolio fields.
    """
    mapping = {}
    for idx, cell in enumerate(row_cells):
        if cell is None or pd.isna(cell):
            continue
        cleaned = clean_column_name(str(cell))
        
        # Symbol / Scheme Name
        if cleaned in ["isin", "symbol", "ticker", "code", "schemecode", "scrip", "instrument", "tradingsymbol", "schemename"]:
            mapping["symbol"] = idx
        # Quantity / Units
        elif cleaned in ["qty", "quantity", "units", "shares", "holding", "holdings", "volume"]:
            mapping["quantity"] = idx
        # Buy Price
        elif cleaned in ["averagebuyprice", "buyprice", "avgprice", "rate", "cost", "averagecost", "avgcost", "buyrate", "nav", "purchasenav", "unitcost", "averageprice", "priceunit", "costprice"]:
            mapping["buy_price"] = idx
        # Invested Value
        elif cleaned in ["investedvalue", "invested", "investment", "investmentvalue", "totalinvestment", "investedamount", "purchasevalue", "costbasis", "totalinvested", "investedval", "amountinvested"]:
            mapping["invested_value"] = idx
        # Current Price / CMP / LTP / NAV
        elif cleaned in ["closingprice", "currentprice", "cmp", "ltp", "lastprice", "marketprice", "closingnav", "lasttradedprice"]:
            mapping["current_price"] = idx
        # Current Value
        elif cleaned in ["currentvalue", "marketvalue", "totalvalue", "holdingvalue", "valuation", "value", "amount", "currentamount"]:
            mapping["current_value"] = idx
        # Name
        elif cleaned in ["name", "description", "companyname", "company", "title", "desc"]:
            mapping["name"] = idx
        # Buy Date
        elif cleaned in ["buydate", "date", "purchasedate", "transactiondate", "time", "purchased"]:
            mapping["buy_date"] = idx
        # Asset Class
        elif cleaned in ["assetclass", "asset", "type", "class"]:
            mapping["asset_class"] = idx
            
    # Check if we have the critical columns mapped successfully
    if "symbol" in mapping and "quantity" in mapping and ("buy_price" in mapping or "invested_value" in mapping):
        return mapping
    return None

def parse_date(date_val: Any) -> date:
    """
    Attempts to parse date values of multiple types and formats.
    """
    if isinstance(date_val, (date, datetime)):
        return date_val if isinstance(date_val, date) else date_val.date()
        
    date_str = str(date_val).strip()
    
    # Try common formats
    for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%m", "%Y/%m/%d", "%d-%b-%Y"]:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
            
    # ISO-like date timestamp or default
    try:
        return pd.to_datetime(date_str).date()
    except Exception:
        # Return today's date if parsing fails completely
        return date.today()

def find_and_parse_df(df: pd.DataFrame, default_asset_class: str) -> List[Dict[str, Any]]:
    """
    Scans a dataframe to locate the header row and parses transaction rows.
    """
    header_idx = -1
    mapping = None
    
    for r in range(min(len(df), 100)):
        row_cells = list(df.iloc[r])
        mapping = map_headers_for_row(row_cells)
        if mapping is not None:
            header_idx = r
            break
            
    if header_idx == -1:
        # Save first 25 rows for error message details
        scanned_rows = df.iloc[:25].values.tolist()
        raise ValueError(
            f"Could not find the header row containing mandatory columns (Symbol/ISIN, Quantity, Buy Price or Invested Value). "
            f"Rows scanned: {scanned_rows}"
        )
        
    portfolio_items = []
    
    # Clean up rows after the header
    for r in range(header_idx + 1, len(df)):
        row = df.iloc[r]
        
        raw_symbol = row[mapping["symbol"]]
        raw_qty = row[mapping["quantity"]]
        
        if pd.isna(raw_symbol) or pd.isna(raw_qty):
            continue
            
        symbol = str(raw_symbol).strip().upper()
        if not symbol:
            continue
            
        # Clean helper for float parsing
        def clean_float(val: Any) -> Optional[float]:
            if pd.isna(val) or val is None or str(val).strip() == "":
                return None
            try:
                # Remove currency symbols and commas
                cleaned = str(val).replace("₹", "").replace(",", "").replace(" ", "").strip()
                return float(cleaned)
            except ValueError:
                return None
                
        qty = clean_float(raw_qty)
        if qty is None or qty <= 0:
            continue
            
        # Buy price
        price = clean_float(row[mapping["buy_price"]]) if "buy_price" in mapping else None
        invested_val = clean_float(row[mapping["invested_value"]]) if "invested_value" in mapping else None
        
        # Back-calculate buy price if average price is missing
        if (price is None or price == 0) and invested_val is not None and qty > 0:
            price = invested_val / qty
            
        if price is None or price <= 0:
            continue
            
        # Optional fields
        name = symbol
        if "name" in mapping and not pd.isna(row[mapping["name"]]):
            name = str(row[mapping["name"]]).strip()
            
        buy_date = date.today()
        if "buy_date" in mapping and not pd.isna(row[mapping["buy_date"]]):
            buy_date = parse_date(row[mapping["buy_date"]])
            
        asset_class = default_asset_class.upper()
        if "asset_class" in mapping and not pd.isna(row[mapping["asset_class"]]):
            row_asset = str(row[mapping["asset_class"]]).strip().upper()
            if row_asset in ["STOCK", "MUTUAL_FUND", "ETF", "GOLD_ETF", "CASH"]:
                asset_class = row_asset
                
        portfolio_items.append({
            "asset_class": asset_class,
            "symbol": symbol,
            "name": name,
            "quantity": qty,
            "buy_price": price,
            "buy_date": buy_date
        })
        
    return portfolio_items

def parse_portfolio_file(
    file_bytes: bytes, 
    filename: str, 
    default_asset_class: str = "STOCK"
) -> List[Dict[str, Any]]:
    """
    Parses CSV and Excel uploads and converts rows to standard PortfolioItem inputs.
    """
    file_lower = filename.lower()
    
    if not (file_lower.endswith(".csv") or file_lower.endswith(".xlsx") or file_lower.endswith(".xls")):
        raise ValueError("Invalid file format. Only CSV (.csv) and Excel (.xlsx, .xls) files are supported.")

    portfolio_items = []
    parse_error = None
    
    try:
        if file_lower.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes), header=None)
            portfolio_items = find_and_parse_df(df, default_asset_class)
        else:
            # Excel file - scan sheets
            xl = pd.ExcelFile(io.BytesIO(file_bytes))
            for sheet_name in xl.sheet_names:
                df = xl.parse(sheet_name, header=None)
                if len(df) < 2:
                    continue
                try:
                    items = find_and_parse_df(df, default_asset_class)
                    if items:
                        portfolio_items = items
                        break # Successfully parsed!
                except Exception as e:
                    if parse_error is None:
                        parse_error = e
                        
            if not portfolio_items and parse_error is not None:
                raise parse_error
    except Exception as e:
        if isinstance(e, ValueError):
            raise e
        raise ValueError(f"Failed to read spreadsheet file: {str(e)}")

    if not portfolio_items:
        raise ValueError("No valid transaction rows found in the uploaded file.")

    return portfolio_items
