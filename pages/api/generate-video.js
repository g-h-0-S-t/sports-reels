import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { celebrityName, title, description, customScript, videoUrl } = req.body;

  if (!celebrityName || !title || !description || !customScript || !videoUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const videoId = Date.now().toString();
  const isVercel = process.env.VERCEL;
  const videosDir = isVercel ? '/tmp/videos' : path.join(process.cwd(), 'public', 'videos');
  const videosJsonPath = isVercel ? '/tmp/videos.json' : path.join(process.cwd(), 'data', 'videos.json');
  const newVideo = {
    id: videoId,
    celebrityName,
    title,
    description,
    customScript,
    videoUrl: `/videos/${path.basename(videoUrl)}`
  };

  try {
    // Clean only temporary files (.mp3, .jpg), preserve .mp4
    if (fs.existsSync(videosDir)) {
      fs.readdirSync(videosDir).forEach(file => {
        if (file.endsWith('.mp3') || file.endsWith('.jpg')) {
          fs.unlinkSync(path.join(videosDir, file));
          console.log(`Deleted temporary file: ${file}`);
        }
      });
      console.log(`Cleaned temporary files in ${videosDir}`);
    } else {
      fs.mkdirSync(videosDir, { recursive: true });
      console.log(`Created ${videosDir}`);
    }

    // Write to videos.json
    let videosData = { videos: [] };
    if (fs.existsSync(videosJsonPath)) {
      videosData = JSON.parse(fs.readFileSync(videosJsonPath, 'utf8'));
    }
    videosData.videos.push(newVideo);
    fs.writeFileSync(videosJsonPath, JSON.stringify(videosData, null, 2));
    console.log(`Wrote video metadata to ${videosJsonPath}`);

    // Run generate_videos.py
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(process.cwd(), 'generate_videos.py');
    const logPath = isVercel ? '/tmp/generate_videos.log' : path.join(process.cwd(), 'generate_videos.log');
    const command = isVercel
      ? `${pythonCommand} "${scriptPath}" --single ${videoId} > ${logPath} 2>&1 &`
      : `${pythonCommand} "${scriptPath}" --single ${videoId} > ${logPath} 2>&1`;
    console.log(`Executing: ${command}`);

    if (isVercel) {
      exec(command, (error) => {
        if (error) {
          console.error(`Background video generation error: ${error.message}`);
        } else {
          console.log('Background video generation started');
        }
      });
      res.status(202).json(newVideo);
    } else {
      try {
        await execPromise(command);
        console.log('Video generation completed');
        res.status(200).json(newVideo);
      } catch (error) {
        console.error(`Video generation failed: ${error.message}`);
        res.status(500).json({ error: `Video generation failed: ${error.message}` });
      }
    }
  } catch (error) {
    console.error('Error in generate-video API:', error.message);
    res.status(500).json({ error: `Failed to initiate video generation: ${error.message}` });
  }
}