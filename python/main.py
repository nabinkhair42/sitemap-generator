from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, HttpUrl
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET
import time
import os
from urllib.robotparser import RobotFileParser

app = FastAPI(
    title="Sitemap Generator API",
    description="Generate sitemaps for any website with respect to robots.txt",
    version="1.0.0"
)

# Configuration
TIMEOUT = 10
CRAWL_DELAY = 2  # Increased delay to be more respectful
MAX_PAGES_LIMIT = 500

class SitemapRequest(BaseModel):
    url: HttpUrl
    max_pages: int = 100

def check_robots_txt(url: str) -> tuple[bool, int]:
    """Check robots.txt for crawling permissions and delay"""
    parsed_url = urlparse(url)
    robots_url = f"{parsed_url.scheme}://{parsed_url.netloc}/robots.txt"
    rp = RobotFileParser()
    try:
        rp.set_url(robots_url)
        rp.read()
        can_fetch = rp.can_fetch("*", url)
        crawl_delay = rp.crawl_delay("*") or CRAWL_DELAY
        return can_fetch, crawl_delay
    except:
        return True, CRAWL_DELAY

def get_internal_links(url, base_domain, visited=set(), max_pages=100):
    if len(visited) >= max_pages:
        return visited

    try:
        print(f"Crawling: {url}")
        response = requests.get(url, timeout=TIMEOUT, 
                              headers={
                                  'User-Agent': 'SitemapGenerator/1.0 (https://github.com/nabinkhair42/sitemap-generator)',
                                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                                  'Accept-Language': 'en-US,en;q=0.5'
                              })
        response.raise_for_status()
        
        # Check content type
        if 'text/html' not in response.headers.get('content-type', '').lower():
            return visited
            
        time.sleep(CRAWL_DELAY)
        
        soup = BeautifulSoup(response.text, 'html.parser')
        for link in soup.find_all('a', href=True):
            href = urljoin(url, link['href'])
            parsed_href = urlparse(href)
            
            # Only process internal links with http(s) scheme
            if (parsed_href.netloc == base_domain and 
                parsed_href.scheme in ['http', 'https'] and
                href not in visited and 
                not any(href.endswith(ext) for ext in [
                    '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.css', '.js', 
                    '.zip', '.tar', '.gz', '.doc', '.docx', '.xls', '.xlsx'
                ])):
                
                visited.add(href)
                print(f"Found: {href}")
                visited.update(get_internal_links(href, base_domain, visited, max_pages))
    except Exception as e:
        print(f"Error processing {url}: {str(e)}")
    
    return visited

@app.post("/generate-sitemap")
async def generate_sitemap(request: SitemapRequest):
    url = str(request.url)
    parsed_url = urlparse(url)
    domain = parsed_url.netloc
    
    # Validate max_pages
    if request.max_pages > MAX_PAGES_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"max_pages cannot exceed {MAX_PAGES_LIMIT}"
        )
    
    # Check robots.txt
    can_fetch, crawl_delay = check_robots_txt(url)
    if not can_fetch:
        raise HTTPException(
            status_code=403,
            detail="This website does not allow crawling according to robots.txt"
        )
    
    # Create sitemaps directory
    os.makedirs("sitemaps", exist_ok=True)
    output_file = f"sitemaps/sitemap_{domain.replace('.', '_')}.xml"
    
    # Get all links
    links = get_internal_links(
        url, 
        domain, 
        visited={url}, 
        max_pages=request.max_pages
    )
    
    # Generate sitemap
    urlset = ET.Element('urlset', xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    for link in links:
        url_element = ET.SubElement(urlset, 'url')
        # console log each link
        print(f"Adding link: {link}")
        loc = ET.SubElement(url_element, 'loc')
        loc.text = link
    # keep logging each link
    print(f"Total links found: {len(links)}")

    tree = ET.ElementTree(urlset)
    tree.write(output_file, encoding='utf-8', xml_declaration=True)
    
    return {
        "message": "Sitemap generated successfully",
        "file_path": output_file,
        "url_count": len(links),
        "crawl_delay_used": crawl_delay
    }

@app.get("/")
async def root():
    return {
        "message": "Sitemap Generator API",
        "endpoints": {
            "generate_sitemap": "/generate-sitemap",
            "documentation": "/docs"
        }
    }