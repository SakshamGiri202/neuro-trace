import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.routers import upload, accounts, rings

app = FastAPI(
    title="NeuroTrace API",
    description="Financial crime detection and forensic analysis API",
    version="2.1.0",
)

# Primary CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Fallback: inject CORS headers on every response (catches edge cases)
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    if request.method == "OPTIONS":
        response = Response(status_code=200)
    else:
        response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


app.include_router(upload.router)
app.include_router(accounts.router)
app.include_router(rings.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
