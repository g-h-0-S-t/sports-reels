const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

async function checkVideos() {
  const videosJsonPath = path.join(process.cwd(), 'data', 'videos.json');
  const videosDir = path.join(process.cwd(), 'public', 'videos');

  try {
    // Read videos.json
    const videosJson = await fs.readFile(videosJsonPath, 'utf8');
    const { videos } = JSON.parse(videosJson);
    const jsonMtime = (await fs.stat(videosJsonPath)).mtimeMs;

    let needsRegeneration = false;

    // Check each video
    for (const video of videos) {
      const fileName = path.basename(video.videoUrl);
      const videoPath = path.join(videosDir, fileName);

      try {
        const videoStat = await fs.stat(videoPath);
        if (jsonMtime > videoStat.mtimeMs) {
          console.log(`Video ${fileName} is outdated. Regeneration needed.`);
          needsRegeneration = true;
          break;
        }
      } catch (err) {
        console.log(`Video ${fileName} missing. Regeneration needed.`);
        needsRegeneration = true;
        break;
      }
    }

    if (!needsRegeneration) {
      console.log('All videos are up-to-date. Skipping regeneration.');
      return;
    }

    // Run generate_videos.py with python3 for cross-platform compatibility
    console.log('Regenerating videos...');
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3.12';//'python3';
    const { stdout, stderr } = await execPromise(`${pythonCommand} generate_videos.py`);
    console.log(stdout);
    if (stderr) {
      console.error('Warnings/Errors from generate_videos.py:', stderr);
    }
    console.log('Video regeneration complete.');
  } catch (error) {
    console.error('Error during video check/regeneration:', error.message);
    process.exit(1);
  }
}

checkVideos();
