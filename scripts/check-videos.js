const fetch = require('node-fetch');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

async function checkVideos() {
  const videosJsonUrl = 'https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos.json';

  try {
    // Fetch videos.json from GitHub
    let videos = [];
    try {
      const response = await fetch(videosJsonUrl);
      if (response.ok) {
        const data = await response.json();
        videos = data.videos || [];
        console.log('Fetched videos.json from GitHub');
      } else if (response.status === 404) {
        console.log('videos.json not found in repo, assuming empty');
      } else {
        throw new Error(`Failed to fetch videos.json: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error fetching videos.json: ${error.message}`);
      // Proceed with empty array
    }

    let needsRegeneration = false;

    // Check each video's raw URL
    for (const video of videos) {
      const videoUrl = video.videoUrl; // e.g., https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos/serena-williams-history.mp4
      try {
        const response = await fetch(videoUrl, { method: 'HEAD' });
        if (!response.ok) {
          console.log(`Video ${videoUrl} missing (status: ${response.status}). Regeneration needed.`);
          needsRegeneration = true;
          break;
        }
        console.log(`Video ${videoUrl} exists`);
      } catch (error) {
        console.log(`Video ${videoUrl} inaccessible: ${error.message}. Regeneration needed.`);
        needsRegeneration = true;
        break;
      }
    }

    if (!needsRegeneration) {
      console.log('All videos are up-to-date. Skipping regeneration.');
      return;
    }

    // Run generate_videos.py
    console.log('Regenerating videos...');
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
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