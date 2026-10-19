import asyncio
import redis.asyncio as redis
import json
import os
import logging
from typing import Optional, Any

logger = logging.getLogger(__name__)

class CacheService:
    """Redis cache service with graceful fallback when Redis is unavailable."""

    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = os.getenv("REDIS_URL", redis_url)
        self.redis: Optional[redis.Redis] = None
        self.available = False

    async def connect(self):
        try:
            self.redis = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            await asyncio.wait_for(self.redis.ping(), timeout=3.0)
            self.available = True
            logger.info("Redis connected successfully")
        except Exception as e:
            logger.warning(f"Redis unavailable, running without cache: {e}")
            self.available = False
            self.redis = None

    async def close(self):
        if self.redis:
            try:
                await self.redis.close()
            except Exception:
                pass

    async def get_financials(self, ticker: str) -> Optional[Any]:
        if not self.available:
            return None
        try:
            data = await self.redis.get(f"ticker:{ticker}:financials")
            return json.loads(data) if data else None
        except Exception:
            return None

    async def set_financials(self, ticker: str, data: Any, expire: int = 86400):
        if not self.available:
            return
        try:
            await self.redis.set(f"ticker:{ticker}:financials", json.dumps(data), ex=expire)
        except Exception:
            pass

    async def get_analysis(self, ticker: str) -> Optional[Any]:
        if not self.available:
            return None
        try:
            data = await self.redis.get(f"ticker:{ticker}:analysis")
            return json.loads(data) if data else None
        except Exception:
            return None

    async def set_analysis(self, ticker: str, data: Any, expire: int = 3600):
        if not self.available:
            return
        try:
            await self.redis.set(f"ticker:{ticker}:analysis", json.dumps(data), ex=expire)
        except Exception:
            pass
