import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import upload, accounts, rings

app = FastAPI(
    title="NeuroTrace API",
    description="Financial crime detection and forensic analysis API",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(accounts.router)
app.include_router(rings.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
