import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const { path: filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  const decodedPath = decodeURIComponent(filePath);
  const absolutePath = path.resolve('/tmp/videos', path.basename(decodedPath));

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'Video not found' });
  }

  try {
    const stat = fs.statSync(absolutePath);
    const fileStream = fs.createReadStream(absolutePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error serving video:', error);
    res.status(500).json({ error: 'Failed to serve video' });
  }
}