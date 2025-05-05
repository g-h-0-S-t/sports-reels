import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const maxRetries = 5;
  const retryDelay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[ProxyJSON] Fetching JSON, attempt ${attempt}/${maxRetries}: ${url}`);
      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });

      console.log(`[ProxyJSON] Status: ${response.status}, Headers:`, Object.fromEntries(response.headers));
      if (!response.ok) {
        throw new Error(`Failed to fetch JSON: ${response.status}`);
      }

      // Set CORS and caching headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');

      // Buffer response
      const data = await response.json();
      console.log(`[ProxyJSON] Successfully fetched JSON: ${url}`);
      res.status(200).json(data);
      return;
    } catch (error) {
      console.error(`[ProxyJSON] Error attempt ${attempt}/${maxRetries}: ${error.message}`);
      if (attempt === maxRetries) {
        return res.status(500).json({ error: `Failed to proxy JSON: ${error.message}` });
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}