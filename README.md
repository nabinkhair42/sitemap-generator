# Sitemap Generator for any website
This is a simple python script that generates a sitemap for any website. It uses the requests library to get the HTML content of the website and then uses BeautifulSoup to parse the HTML and extract the links.


# Conclusion

Life is way much faster and easier if you uses python instead of getting stuck on those silly nodejs npm packages. Python is the best language for web scraping and automation. It is easy to learn and has a lot of libraries that can help you in your projects.

Completely wasted more than 2 hour to build the costume sitemap generator using node and typescript and was not worth it. I should have used python from the start.


Use Python and Stay Happy! 😊


## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/fastapi-sitemap-generator.git
cd fastapi-sitemap-generator
```

2. Install dependencies:
```bash
pip install fastapi[all] beautifulsoup4 requests pydantic
```

## Usage

1. Start the server:
```bash
uvicorn main:app --reload
```

2. Access the API:
- API Documentation: http://localhost:8000/docs
- Generate sitemap endpoint: http://localhost:8000/generate-sitemap

3. Make a POST request:
```bash
curl -X POST "http://localhost:8000/generate-sitemap" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com", "max_pages": 100}'
```

## Configuration

- `TIMEOUT`: Request timeout (default: 10 seconds)
- `CRAWL_DELAY`: Minimum delay between requests (default: 2 seconds)
- `MAX_PAGES_LIMIT`: Maximum pages to crawl (default: 500)

## API Response

```json
{
    "message": "Sitemap generated successfully",
    "file_path": "sitemaps/sitemap_example_com.xml",
    "url_count": 42,
    "crawl_delay_used": 2
}
```
