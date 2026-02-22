"""Run the Diablo backend server: ``python -m backend``."""
import uvicorn
from backend.config import config

if __name__ == "__main__":
    uvicorn.run(
        "backend.server:app",
        host=config.host,
        port=config.port,
        reload=False,
        log_level="info",
    )
