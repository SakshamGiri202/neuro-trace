"""
RingBreaker API - Main Application.
"""

from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import upload, rings, accounts


app = FastAPI(
    title="RingBreaker API",
    version="1.0.0",
    description="Financial crime detection system",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(rings.router)
app.include_router(accounts.router)


@app.get("/")
async def root() -> Dict[str, Any]:
    return {"message": "RingBreaker API is running", "version": "1.0.0"}


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
