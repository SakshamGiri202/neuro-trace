"""
Rings router for RingBreaker API.
"""

from typing import List

from fastapi import APIRouter, HTTPException

from app.models.schemas import FraudRing
import app.routers.upload as upload_module


router = APIRouter(prefix="/api/rings", tags=["rings"])


@router.get("", response_model=List[FraudRing])
async def get_all_rings() -> List[FraudRing]:
    """Get all fraud rings from the last analysis."""
    if upload_module.last_analysis_result is None:
        raise HTTPException(status_code=404, detail="No analysis has been run yet")
    return upload_module.last_analysis_result.fraud_rings


@router.get("/{ring_id}", response_model=FraudRing)
async def get_ring_by_id(ring_id: str) -> FraudRing:
    """Get details of a specific fraud ring by ring ID."""
    if upload_module.last_analysis_result is None:
        raise HTTPException(status_code=404, detail="No analysis has been run yet")
    for ring in upload_module.last_analysis_result.fraud_rings:
        if ring.ring_id == ring_id:
            return ring
    raise HTTPException(status_code=404, detail=f"Ring '{ring_id}' not found")
