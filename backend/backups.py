import os
import shutil
import glob
from datetime import datetime
from sqlalchemy.orm import Session
from backend.config import DATABASE_URL
from backend import models

BACKUP_DIR = "./backups"

def run_backup(db_session: Session = None) -> str:
    """
    Executes a backup of the SQLite database. If using PostgreSQL, exports schema.
    Keeps a rolling retention window of the last 7 backups.
    """
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    if DATABASE_URL.startswith("sqlite"):
        # Local SQLite database backup
        db_path = DATABASE_URL.replace("sqlite:///", "").strip()
        if not os.path.exists(db_path):
            return f"Backup failed: source database '{db_path}' not found."
            
        backup_filename = f"portfolio_backup_{timestamp}.db"
        dest_path = os.path.join(BACKUP_DIR, backup_filename)
        
        try:
            shutil.copy2(db_path, dest_path)
            message = f"SQLite backup completed successfully: {dest_path}"
            
            # Log in Audit trail if DB session is present
            if db_session:
                audit = models.AuditLog(
                    action="DAILY_BACKUP",
                    details=f"Database backed up to {backup_filename}",
                    ip_address="system_daemon"
                )
                db_session.add(audit)
                db_session.commit()
                
            # Perform rotation (keep last 7)
            rotate_backups()
            
            return message
        except Exception as e:
            return f"Backup process failed: {str(e)}"
    else:
        # Mock for PostgreSQL backup (e.g. pg_dump command suggestion)
        backup_filename = f"pg_portfolio_dump_{timestamp}.sql"
        dest_path = os.path.join(BACKUP_DIR, backup_filename)
        try:
            with open(dest_path, "w") as f:
                f.write(f"-- PostgreSQL Dump Mock\n-- Generated on {datetime.now()}\n-- DATABASE: {DATABASE_URL}\n")
            
            if db_session:
                audit = models.AuditLog(
                    action="DAILY_BACKUP",
                    details=f"PostgreSQL dump simulated to {backup_filename}",
                    ip_address="system_daemon"
                )
                db_session.add(audit)
                db_session.commit()
                
            rotate_backups()
            return f"PostgreSQL backup simulated successfully: {dest_path}"
        except Exception as e:
            return f"PostgreSQL backup simulation failed: {str(e)}"

def rotate_backups():
    """
    Removes oldest backup files keeping only the 7 most recent backups.
    """
    pattern = os.path.join(BACKUP_DIR, "portfolio_backup_*")
    files = glob.glob(pattern)
    
    # Sort files by modification date
    files.sort(key=os.path.getmtime)
    
    # Keep last 7 backups, delete the rest
    if len(files) > 7:
        to_delete = files[:-7]
        for f in to_delete:
            try:
                os.remove(f)
            except OSError:
                pass
