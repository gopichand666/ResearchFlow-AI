import os
from firecrawl import FirecrawlApp
from dotenv import load_dotenv

load_dotenv()

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")


def scrape_url(url: str) -> dict:
    """
    Scrapes the provided URL using Firecrawl and returns the markdown content
    and title.
    """
    if not FIRECRAWL_API_KEY:
        raise ValueError("FIRECRAWL_API_KEY is not set.")

    app = FirecrawlApp(api_key=FIRECRAWL_API_KEY)
    result = app.scrape(url, formats=["markdown"])

    return {
        "content": result.markdown or "",
        "title": getattr(result.metadata, "title", "Unknown Title") if result.metadata else "Unknown Title",
    }
