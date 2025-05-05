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
  const tempVideosDir = process.env.NODE_ENV === 'production' ? '/tmp/videos' : path.join(process.cwd(), 'temp', 'videos');
  const videosJsonPath = path.join(process.cwd(), 'data', 'videos.json');
  const githubRepoUrl = 'https://github.com/g-h-0-S-t/sports-reels-videos.git';
  const rawVideoUrl = `https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos/${path.basename(videoUrl)}`;
  const newVideo = {
    id: videoId,
    celebrityName,
    title,
    description,
    customScript,
    videoUrl: rawVideoUrl
  };

  try {
    // Clean temporary files (.mp3, .jpg, .mp4)
    if (fs.existsSync(tempVideosDir)) {
      fs.readdirSync(tempVideosDir).forEach(file => {
        fs.unlinkSync(path.join(tempVideosDir, file));
        console.log(`Deleted temporary file: ${file}`);
      });
    } else {
      fs.mkdirSync(tempVideosDir, { recursive: true });
      console.log(`Created ${tempVideosDir}`);
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
    const logPath = path.join(process.cwd(), 'generate_videos.log');
    const command = `${pythonCommand} "${scriptPath}" --single ${videoId} > ${logPath} 2>&1`;
    console.log(`Executing: ${command}`);

    try {
      await execPromise(command);
      const videoFilePath = path.join(tempVideosDir, path.basename(videoUrl));
      if (!fs.existsSync(videoFilePath)) {
        const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : 'Log file missing';
        console.error(`Video file not found: ${videoFilePath}`);
        console.error(`generate_videos.py log: ${logContent}`);
        throw new Error(`Video file not generated: ${logContent}`);
      }
      console.log('Video generation completed');

      // Push to GitHub
      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        throw new Error('GITHUB_TOKEN not set');
      }
      const repoDir = '/tmp/repo-sports-reels-videos';
      if (fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true, force: true });
      }
      fs.mkdirSync(repoDir, { recursive: true });
      await execPromise(`git clone https://${githubToken}@github.com/g-h-0-S-t/sports-reels-videos.git ${repoDir}`);
      const videoDestPath = path.join(repoDir, 'videos', path.basename(videoUrl));
      fs.copyFileSync(videoFilePath, videoDestPath);
      await execPromise(`cd ${repoDir} && git add videos/${path.basename(videoUrl)}`);
      await execPromise(`cd ${repoDir} && git commit -m "Add video ${path.basename(videoUrl)}"`);
      await execPromise(`cd ${repoDir} && git push origin main`);
      console.log(`Pushed ${path.basename(videoUrl)} to GitHub`);

      res.status(200).json(newVideo);
    } catch (error) {
      const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : 'Log file missing';
      console.error(`Video generation or push failed: ${error.message}`);
      console.error(`generate_videos.py log: ${logContent}`);
      res.status(500).json({ error: `Failed: ${error.message}, Log: ${logContent}` });
    }
  } catch (error) {
    console.error('Error in generate-video API:', error.message);
    res.status(500).json({ error: `Failed to initiate video generation: ${error.message}` });
  }
}
