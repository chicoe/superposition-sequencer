from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import circuit as circuit_routes
from app.routes import compute as compute_routes
from app.routes import measure as measure_routes
from app.routes import qasm as qasm_routes


def create_app() -> FastAPI:
    app = FastAPI(title="Superposition Sequencer", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        # Wildcard is deliberate: the API is stateless, holds no credentials,
        # and in production sits behind a same-origin Firebase Hosting rewrite.
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(circuit_routes.router)
    app.include_router(measure_routes.router)
    app.include_router(compute_routes.router)
    app.include_router(qasm_routes.router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
