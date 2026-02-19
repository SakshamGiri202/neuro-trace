"""
Accounts router for RingBreaker API.
"""

from fastapi import APIRouter, HTTPException

from app.models.schemas import SuspiciousAccount
import app.routers.upload as upload_module


router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.get("/{account_id}", response_model=SuspiciousAccount)
async def get_account_details(account_id: str) -> SuspiciousAccount:
    """Get suspicion details for a specific account."""
    if upload_module.state.result is None:
        raise HTTPException(status_code=404, detail="No analysis has been run yet")
    for account in upload_module.state.result.suspicious_accounts:
        if account.account_id == account_id:
            return account
    raise HTTPException(
        status_code=404,
        detail=f"Account '{account_id}' not found or not flagged as suspicious",
    )
