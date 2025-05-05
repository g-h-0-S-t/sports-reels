import { execSync } from 'child_process';
import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { celebrityName, title, description, customScript } = req.body;

  if (!celebrityName || !title || !description || !customScript) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const repoDir = join(tmpdir(), `sports-reels-videos-${Date.now()}`);
  const githubToken = process.env.GITHUB_TOKEN;
  const gitUrl = `https://${githubToken}@github.com/g-h-0-S-t/sports-reels-videos.git`;

  try {
    console.log('[GenerateVideo] Starting video generation for:', celebrityName);
    const videosJsonPath = join(repoDir, 'videos.json');
    const videoFileName = `${celebrityName.toLowerCase().replace(/\s+/g, '-')}-history.mp4`;
    const videoPath = join(repoDir, 'videos', videoFileName);
    const videoUrl = `https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos/${videoFileName}`;
    const pythonScriptPath = process.env.NODE_ENV === 'development'
      ? '/Users/ribhubiswas/Desktop/data/experiments/sports-reels/generate_videos.py'
      : '/app/generate_videos.py';

    // Clone repo
    console.log('[GenerateVideo] Cloning repo to:', repoDir);
    try {
      execSync(`git clone ${gitUrl} ${repoDir}`, { stdio: 'inherit' });
      execSync(`cd ${repoDir} && git config user.email "generate@video.com" && git config user.name "Video Generator"`, { stdio: 'inherit' });
    } catch (error) {
      console.error('[GenerateVideo] Git clone error:', error.message);
      throw new Error('Failed to clone repo');
    }

    // Generate video
    console.log('[GenerateVideo] Running Python script:', pythonScriptPath);
    const escapedScript = customScript.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const command = `python3 ${pythonScriptPath} --celebrity "${celebrityName}" --title "${title}" --description "${description}" --script "${escapedScript}"`;
    try {
      const output = execSync(command, { stdio: 'pipe', encoding: 'utf8', cwd: repoDir });
      console.log('[GenerateVideo] Python script output:', output);
    } catch (error) {
      console.error('[GenerateVideo] Python script error:', error.message);
      console.error('[GenerateVideo] Python stderr:', error.stderr);
      throw new Error(`Python script failed: ${error.stderr || error.message}`);
    }

    // Verify video file
    if (!existsSync(videoPath)) {
      console.error('[GenerateVideo] Video file not found:', videoPath);
      console.error('[GenerateVideo] Videos directory contents:', readdirSync(join(repoDir, 'videos')));
      throw new Error('Video file was not generated');
    }
    console.log('[GenerateVideo] Video file verified:', videoPath);

    // Update videos.json
    console.log('[GenerateVideo] Updating videos.json');
    let videosData = { videos: [] };
    try {
      videosData = JSON.parse(readFileSync(videosJsonPath, 'utf-8'));
    } catch (error) {
      console.error('[GenerateVideo] Error reading videos.json, initializing new:', error.message);
    }

    const newVideo = {
      id: videosData.videos.length + 1,
      celebrityName,
      title,
      description,
      videoUrl
    };

    videosData.videos = videosData.videos.filter(v => v.videoUrl !== videoUrl);
    videosData.videos.push(newVideo);

    writeFileSync(videosJsonPath, JSON.stringify(videosData, null, 2));
    console.log('[GenerateVideo] Updated videos.json:', videosData.videos);

    // Commit and push changes
    console.log('[GenerateVideo] Committing and pushing changes');
    try {
      // Ensure remote URL includes PAT
      execSync(`cd ${repoDir} && git remote set-url origin ${gitUrl}`, { stdio: 'inherit' });
      console.log('[GenerateVideo] Remote URL set:', gitUrl.replace(githubToken, '****'));
      // Cache PAT in credential helper
      execSync(`cd ${repoDir} && printf "protocol=https\nhost=github.com\nusername=git\npassword=${githubToken}\n" | git credential-osxkeychain store`, { stdio: 'inherit' });
      console.log('[GenerateVideo] PAT cached in credential helper');
      execSync(`cd ${repoDir} && git add videos.json videos/${videoFileName} && git commit -m "Add video for ${celebrityName}" && git push origin main`, { stdio: 'inherit' });
      console.log('[GenerateVideo] Push successful');
    } catch (error) {
      console.error('[GenerateVideo] Git commit/push error:', error.message);
      throw new Error('Failed to push video and videos.json to repo');
    }

    console.log('[GenerateVideo] Video generated and pushed:', videoUrl);
    return res.status(200).json({ videoUrl, videos: videosData.videos });
  } catch (error) {
    console.error('[GenerateVideo] Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    // Clean up
    try {
      console.log('[GenerateVideo] Deleting temp repo:', repoDir);
      rmSync(repoDir, { recursive: true, force: true });
    } catch (error) {
      console.error('[GenerateVideo] Cleanup error:', error.message);
    }
  }
}