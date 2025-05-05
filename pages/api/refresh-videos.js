import { execSync } from 'child_process';
import { readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export default async function handler(req, res) {
  const repoDir = join(tmpdir(), `sports-reels-videos-refresh-${Date.now()}`);
  const gitUrl = `https://github_pat_${process.env.GITHUB_TOKEN}@github.com/g-h-0-S-t/sports-reels-videos.git`;

  try {
    console.log('[RefreshVideos] Cloning repo to:', repoDir);
    execSync(`git clone ${gitUrl} ${repoDir}`, { stdio: 'inherit' });

    const videosJsonPath = join(repoDir, 'videos.json');
    console.log('[RefreshVideos] Reading videos.json:', videosJsonPath);
    const videosData = JSON.parse(readFileSync(videosJsonPath, 'utf-8'));
    console.log('[RefreshVideos] Fetched videos:', videosData.videos);

    return res.status(200).json({ videos: videosData.videos || [] });
  } catch (error) {
    console.error('[RefreshVideos] Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    try {
      console.log('[RefreshVideos] Deleting temp repo:', repoDir);
      rmSync(repoDir, { recursive: true, force: true });
    } catch (error) {
      console.error('[RefreshVideos] Cleanup error:', error.message);
    }
  }
}