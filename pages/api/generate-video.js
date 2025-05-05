import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
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

  const tempVideosDir = process.env.NODE_ENV === 'production' ? '/tmp/videos' : path.join(process.cwd(), 'temp', 'videos');
  const githubRepoUrl = 'https://github.com/g-h-0-S-t/sports-reels-videos.git';
  const rawVideoUrl = `https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos/${path.basename(videoUrl)}`;
  const videosJsonUrl = 'https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos.json';

  try {
    // Clean temporary files (.mp3, .jpg, .mp4) before generation
    if (fs.existsSync(tempVideosDir)) {
      fs.readdirSync(tempVideosDir).forEach(file => {
        fs.unlinkSync(path.join(tempVideosDir, file));
        console.log(`Deleted temporary file: ${file}`);
      });
    } else {
      fs.mkdirSync(tempVideosDir, { recursive: true });
      console.log(`Created ${tempVideosDir}`);
    }

    // Fetch videos.json from GitHub
    let videosData = { videos: [] };
    try {
      const response = await fetch(videosJsonUrl);
      if (response.ok) {
        videosData = await response.json();
        console.log('Fetched videos.json from GitHub');
      } else if (response.status === 404) {
        console.log('videos.json not found in repo, using empty array');
      } else {
        throw new Error(`Failed to fetch videos.json: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error fetching videos.json: ${error.message}`);
      // Proceed with empty array if fetch fails
    }

    // Check for existing video with same videoUrl
    let videoId;
    const existingVideoIndex = videosData.videos.findIndex(v => v.videoUrl === rawVideoUrl);
    if (existingVideoIndex !== -1) {
      // Reuse existing ID and update entry
      videoId = videosData.videos[existingVideoIndex].id;
      console.log(`Re-generating existing video with ID ${videoId} for ${rawVideoUrl}`);
      videosData.videos[existingVideoIndex] = {
        id: videoId,
        celebrityName,
        title,
        description,
        customScript,
        videoUrl: rawVideoUrl
      };
    } else {
      // Create new ID and add entry
      videoId = Date.now().toString();
      console.log(`Generating new video with ID ${videoId} for ${rawVideoUrl}`);
      videosData.videos.push({
        id: videoId,
        celebrityName,
        title,
        description,
        customScript,
        videoUrl: rawVideoUrl
      });
    }

    const newVideo = {
      id: videoId,
      celebrityName,
      title,
      description,
      customScript,
      videoUrl: rawVideoUrl
    };

    // Run generate_videos.py
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(process.cwd(), 'generate_videos.py');
    const logPath = path.join(process.cwd(), 'generate_videos.log');
    // Escape customScript to handle quotes and spaces
    const escapedCustomScript = customScript.replace(/"/g, '\\"');
    const command = `${pythonCommand} "${scriptPath}" --single ${videoId} --celebrity "${celebrityName}" --video-url "${rawVideoUrl}" --custom-script "${escapedCustomScript}" > "${logPath}" 2>&1`;
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
      
      // Copy video
      const videoDestPath = path.join(repoDir, 'videos', path.basename(videoUrl));
      fs.copyFileSync(videoFilePath, videoDestPath);
      
      // Write videos.json
      const videosJsonPath = path.join(repoDir, 'videos.json');
      fs.writeFileSync(videosJsonPath, JSON.stringify(videosData, null, 2));
      console.log(`Wrote videos.json to ${videosJsonPath}`);

      // Commit and push
      await execPromise(`cd ${repoDir} && git add videos/${path.basename(videoUrl)} videos.json`);
      await execPromise(`cd ${repoDir} && git config user.email "6196046+g-h-0-S-t@users.noreply.github.com"`);
      await execPromise(`cd ${repoDir} && git config user.name "g-h-0-S-t"`);
      await execPromise(`cd ${repoDir} && git commit -m "Add or update video ${path.basename(videoUrl)} and videos.json"`);
      await execPromise(`cd ${repoDir} && git push origin main`);
      console.log(`Pushed ${path.basename(videoUrl)} and videos.json to GitHub`);

      // Clean up temporary files after successful push
      try {
        if (fs.existsSync(videoFilePath)) {
          fs.unlinkSync(videoFilePath);
          console.log(`Deleted temporary video: ${videoFilePath}`);
        }
        if (fs.existsSync(repoDir)) {
          fs.rmSync(repoDir, { recursive: true, force: true });
          console.log(`Deleted temporary repo: ${repoDir}`);
        }
      } catch (cleanupError) {
        console.error(`Failed to clean up temporary files: ${cleanupError.message}`);
        // Don't fail the request due to cleanup error
      }

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
