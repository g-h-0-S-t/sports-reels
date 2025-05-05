export default async function handler(req, res) {
    const { url } = req.query;
  
    if (!url) {
      console.error('[Proxy] Missing video URL');
      return res.status(400).json({ error: 'Video URL is required' });
    }
  
    if (!process.env.GITHUB_TOKEN) {
      console.error('[Proxy] Missing GITHUB_TOKEN in environment');
      return res.status(500).json({ error: 'Server misconfiguration: Missing GitHub token' });
    }
  
    const decodedUrl = decodeURIComponent(url);
    console.log(`[Proxy] Fetching video: ${decodedUrl}`);
  
    const maxRetries = 5;
    const retryDelay = 5000;
  
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(decodedUrl, {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
  
        console.log(`[Proxy] Attempt ${attempt}/${maxRetries}, Status: ${response.status}, Headers:`, Object.fromEntries(response.headers));
  
        if (!response.ok) {
          if (response.status === 401) {
            console.error('[Proxy] Unauthorized: Invalid GITHUB_TOKEN');
            return res.status(500).json({ error: 'Invalid GitHub token' });
          }
          if (response.status === 403) {
            console.error('[Proxy] Forbidden: Check repo permissions or GITHUB_TOKEN scope');
            return res.status(500).json({ error: 'Video access denied: Check GitHub repo permissions' });
          }
          if (response.status === 404) {
            console.error('[Proxy] Video not found, may not be available yet');
            if (attempt === maxRetries) {
              return res.status(404).json({ error: 'Video not found, try again later' });
            }
          }
          if (response.status === 429) {
            console.error('[Proxy] Rate limit exceeded');
            if (attempt === maxRetries) {
              return res.status(429).json({ error: 'GitHub rate limit exceeded, try again later' });
            }
          }
          console.error(`[Proxy] Failed to fetch video: ${response.status}`);
          if (attempt === maxRetries) {
            return res.status(response.status).json({ error: `Failed to fetch video: ${response.status}` });
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          continue;
        }
  
        // Set CORS and content headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
        res.setHeader('Cache-Control', 'no-cache');
  
        // Buffer response using arrayBuffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`[Proxy] Successfully fetched video: ${decodedUrl}`);
        res.status(200).send(buffer);
        return;
      } catch (error) {
        console.error(`[Proxy] Error attempt ${attempt}/${maxRetries}: ${error.message}`);
        if (attempt === maxRetries) {
          return res.status(500).json({ error: `Failed to proxy video: ${error.message}` });
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }