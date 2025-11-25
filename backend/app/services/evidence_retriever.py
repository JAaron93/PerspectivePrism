import httpx
from typing import List, Dict
import logging
import asyncio
from app.core.config import settings
from app.models.schemas import Claim, Evidence, PerspectiveType

logger = logging.getLogger(__name__)

class EvidenceRetriever:
    def __init__(self):
        self.api_key = settings.GOOGLE_API_KEY
        self.cse_id = settings.GOOGLE_CSE_ID
        self.base_url = "https://www.googleapis.com/customsearch/v1"
        
        # Validate credentials at initialization
        if not self.api_key or not self.cse_id:
            missing = []
            if not self.api_key:
                missing.append("GOOGLE_API_KEY")
            if not self.cse_id:
                missing.append("GOOGLE_CSE_ID")
            
            error_msg = f"Missing required credentials: {', '.join(missing)}. Please configure them in your .env file."
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Pre-defined domains for perspectives (MVP list)
        self.perspective_domains = {
            PerspectiveType.SCIENTIFIC: [
                "nature.com", "science.org", "nih.gov", "cdc.gov", "who.int", 
                "scientificamerican.com", "phys.org"
            ],
            PerspectiveType.JOURNALISTIC: [
                "reuters.com", "apnews.com", "bbc.com", "npr.org", "pbs.org",
                "nytimes.com", "wsj.com", "washingtonpost.com", "bloomberg.com"
            ],
            PerspectiveType.PARTISAN_LEFT: [
                "msnbc.com", "huffpost.com", "motherjones.com", "democracynow.org",
                "theintercept.com", "jacobin.com", "vox.com"
            ],
            PerspectiveType.PARTISAN_RIGHT: [
                "foxnews.com", "nypost.com", "breitbart.com", "dailywire.com",
                "washingtontimes.com", "newsmax.com", "nationalreview.com"
            ]
        }

    async def search_google(self, query: str, perspective: PerspectiveType) -> List[Evidence]:
        """
        Searches Google for the query, filtered by the perspective's domains.
        """
        # Construct query with site filters
        domains = self.perspective_domains.get(perspective, [])
        if not domains:
            return []
            
        # Google Search has a limit on query length, so we might need to batch or pick top domains
        # For MVP, we'll take the first 5 domains to keep the query short enough
        site_filter = " OR ".join([f"site:{d}" for d in domains[:5]])
        full_query = f"{query} ({site_filter})"
        
        params = {
            "key": self.api_key,
            "cx": self.cse_id,
            "q": full_query,
            "num": 3 # Number of results to return per perspective
        }
        
        try:
            async with httpx.AsyncClient(timeout=settings.GOOGLE_SEARCH_TIMEOUT) as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                items = data.get("items", [])
                evidence_list = []
                
                for item in items:
                    evidence_list.append(Evidence(
                        url=item.get("link", ""),
                        title=item.get("title", ""),
                        snippet=item.get("snippet", ""),
                        source=item.get("displayLink", ""),
                        perspective=perspective
                    ))
                    
                return evidence_list
                
        except httpx.HTTPStatusError as e:
            # API returned 4xx or 5xx status code (e.g., rate limit, invalid query)
            logger.error(
                "Google API returned error status %s for %s: %s",
                e.response.status_code,
                perspective.value,
                e.response.text[:200],
                exc_info=True
            )
            if e.response.status_code == 429:
                return [Evidence(
                    url="https://developers.google.com/custom-search/v1/overview",
                    title="Search Quota Exceeded",
                    snippet="The daily quota for Google Custom Search API has been exceeded. Unable to retrieve live evidence for this perspective.",
                    source="System",
                    perspective=perspective
                )]
            return []
        except httpx.TimeoutException:
            # Request timed out - recoverable, can retry later
            logger.warning(
                "Timeout searching Google for %s (exceeded 10s)",
                perspective.value
            )
            return []
        except httpx.RequestError as e:
            # Network errors, connection errors, etc. - recoverable
            logger.error(
                "Network error searching Google for %s: %s",
                perspective.value,
                str(e),
                exc_info=True
            )
            return []
        # Let unexpected exceptions propagate (e.g., JSON decode errors, programming errors)

    async def retrieve_evidence(self, claim: Claim, perspectives: List[PerspectiveType]) -> Dict[PerspectiveType, List[Evidence]]:
        """
        Retrieves evidence for a claim across multiple perspectives concurrently.
        Rate-limited to prevent API throttling.
        """
        # Use the claim text as the query. 
        # In a real app, we might want to summarize or extract keywords from the claim text first.
        query = claim.text
        
        # Truncate query if too long (Google limit is around 2048 chars, but practical limit is lower)
        if len(query) > 100:
            query = query[:100]
        
        # Create semaphore for rate limiting
        semaphore = asyncio.Semaphore(settings.GOOGLE_SEARCH_MAX_CONCURRENT)
        
        async def rate_limited_search(perspective: PerspectiveType) -> List[Evidence]:
            """Wrapper to rate-limit search_google calls."""
            async with semaphore:
                return await self.search_google(query, perspective)
        
        # Build coroutines for concurrent execution with rate limiting
        search_tasks = [rate_limited_search(perspective) for perspective in perspectives]
        
        # Execute all searches concurrently, capturing exceptions per-task
        search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        
        # Map results back to perspectives, handling any exceptions
        results = {}
        for perspective, result in zip(perspectives, search_results):
            if isinstance(result, Exception):
                # Log the exception and use empty list
                logger.error(
                    "Unhandled exception retrieving evidence for %s: %s",
                    perspective.value,
                    str(result),
                    exc_info=result
                )
                results[perspective] = []
            else:
                results[perspective] = result
        
        return results
