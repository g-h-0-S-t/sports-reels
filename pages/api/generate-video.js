import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';

const execPromise = util.promisify(exec);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { celebrityName, title, description, customScript, videoUrl } = req.body;

  if (!celebrityName || !title || !description || !customScript || !videoUrl) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Read current videos.json
    const filePath = path.join(process.cwd(), 'data', 'videos.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContents);

    // Generate new ID
    const newId = String(Math.max(...data.videos.map(v => parseInt(v.id))) + 1);

    // Create new video entry
    const newVideo = {
      id: newId,
      title,
      description,
      celebrityName,
      videoUrl,
      customScript
    };

    // Update videos.json
    data.videos.push(newVideo);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    // Run generate_videos.py for the new entry
    const scriptPath = path.join(process.cwd(), 'generate_videos.py');
    const command = `python "${scriptPath}" --single "${newId}"`;
    await execPromise(command);

    // Return the new video entry
    res.status(200).json(newVideo);
  } catch (error) {
    console.error('Error generating video:', error);
    res.status(500).json({ error: 'Failed to generate video' });
  }
}