import json
import os
import argparse
import sys
from transformers import pipeline
from moviepy.editor import ImageClip, concatenate_videoclips, AudioFileClip
from gtts import gTTS
import requests
import logging
import psutil

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def log_memory_usage():
    process = psutil.Process()
    mem_info = process.memory_info()
    logger.info(f"Memory usage: {mem_info.rss / 1024 / 1024:.2f} MB")

def log_dir_usage(dir_path):
    total_size = 0
    for dirpath, _, filenames in os.walk(dir_path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            total_size += os.path.getsize(fp)
    logger.info(f"{dir_path} usage: {total_size / 1024 / 1024:.2f} MB")

def check_dependencies():
    dependencies = ['moviepy', 'transformers', 'gtts', 'requests', 'torch', 'psutil']
    for dep in dependencies:
        try:
            __import__(dep)
            logger.info(f"Dependency {dep} loaded successfully")
        except ImportError as e:
            logger.error(f"Dependency {dep} failed to load: {e}")
            sys.exit(1)

def fetch_images(query, count=5):
    access_key = os.environ.get('UNSPLASH_ACCESS_KEY')
    if not access_key:
        logger.error("UNSPLASH_ACCESS_KEY environment variable not set")
        sys.exit(1)
    url = f"https://api.unsplash.com/search/photos?query={query}&per_page={count}&client_id={access_key}&w=1280&h=720"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        images = [photo['urls']['raw'] + '&w=1280&h=720' for photo in data['results']]
        if len(data['results']) < count:
            logger.warning(f"Only {len(data['results'])} images for {query}, adding fallback")
            images += ["https://source.unsplash.com/1280x720/?sports"] * (count - len(data['results']))
        logger.info(f"Fetched {len(images)} images for query: {query}")
        return images
    except Exception as e:
        logger.error(f"Failed to fetch images for {query}: {e}")
        raise

def generate_script(celebrity, custom_script=None):
    if custom_script:
        logger.info(f"Using custom script for {celebrity}")
        return custom_script
    logger.info(f"Generating script for {celebrity} with gpt2")
    try:
        generator = pipeline('text-generation', model='gpt2', device=-1)  # CPU only
        prompt = f"Tell me a short history of {celebrity} in 50 words."
        script = generator(prompt, max_length=60, num_return_sequences=1, truncation=True)[0]['generated_text']
        logger.info(f"Generated script: {script}")
        return script
    except Exception as e:
        logger.error(f"Failed to generate script for {celebrity}: {e}")
        return f"A short history of {celebrity} could not be generated."

def create_video(celebrity, output_path, custom_script=None):
    logger.info(f"Creating video for {celebrity}")
    log_memory_usage()
    log_dir_usage(os.path.dirname(output_path))
    
    audio_path = os.path.join(os.path.dirname(output_path), f"{celebrity.replace(' ', '_')}_audio.mp3")
    try:
        # Generate script
        script = generate_script(celebrity, custom_script)
        
        # Create audio
        logger.info(f"Saving audio to: {audio_path}")
        tts = gTTS(script, slow=False)
        tts.save(audio_path)
        log_memory_usage()
        log_dir_usage(os.path.dirname(output_path))
        
        # Load audio
        audio = AudioFileClip(audio_path)
        audio_duration = audio.duration  # Use full narration length
        logger.info(f"Audio duration: {audio_duration}s")
        
        # Fetch images
        image_urls = fetch_images(celebrity)
        clips = []
        temp_image_paths = []
        num_images = len(image_urls)
        duration_per_image = audio_duration / num_images if num_images > 0 else audio_duration  # Sync images to narration
        logger.info(f"Total video duration: {audio_duration}s, {num_images} images, {duration_per_image}s per image, frames: {int(audio_duration * 30)}")
        for i, url in enumerate(image_urls):
            img_path = os.path.join(os.path.dirname(output_path), f"temp_{i}.jpg")
            logger.info(f"Saving image to: {img_path}")
            img_data = requests.get(url, timeout=10).content
            with open(img_path, 'wb') as f:
                f.write(img_data)
            clip = ImageClip(img_path, duration=duration_per_image)
            clips.append(clip)
            temp_image_paths.append(img_path)
            log_memory_usage()
            log_dir_usage(os.path.dirname(output_path))
            # Close image file immediately to free memory
            clip.close()
        
        # Create video
        video = concatenate_videoclips(clips, method="compose")
        final_video = video.set_audio(audio)
        
        # Write video with optimized settings
        logger.info(f"Saving video to: {output_path}")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        try:
            final_video.write_videofile(
                output_path,
                codec='libx264',
                audio_codec='aac',
                fps=30,
                preset='veryfast',  # Faster encoding
                threads=1,          # Single thread to reduce memory
                bitrate='1500k',    # Lower bitrate
                logger='bar'        # Minimal logging
            )
            logger.info(f"Video written successfully: {output_path}")
        except Exception as e:
            logger.error(f"Video encoding failed: {e}")
            # Retry with lower settings
            logger.info("Retrying with lower resolution and bitrate")
            final_video.write_videofile(
                output_path,
                codec='libx264',
                audio_codec='aac',
                fps=24,             # Lower FPS
                preset='ultrafast', # Fastest encoding
                threads=1,
                bitrate='1000k',
                logger='bar'
            )
            logger.info(f"Video written successfully on retry: {output_path}")
        
        log_memory_usage()
        log_dir_usage(os.path.dirname(output_path))
        
        # Clean up
        logger.info(f"Cleaning up: {audio_path}, {temp_image_paths}")
        audio.close()
        final_video.close()
        for clip in clips:
            clip.close()
        os.remove(audio_path)
        for img_path in temp_image_paths:
            if os.path.exists(img_path):
                os.remove(img_path)
        
    except Exception as e:
        logger.error(f"Failed to create video for {celebrity}: {e}")
        raise
    finally:
        # Ensure cleanup even on failure
        if os.path.exists(audio_path):
            os.remove(audio_path)
        for img_path in temp_image_paths:
            if os.path.exists(img_path):
                os.remove(img_path)

def main():
    parser = argparse.ArgumentParser(description="Generate sports reels videos")
    parser.add_argument('--single', type=str, help="ID of a single video to generate")
    parser.add_argument('--celebrity', type=str, help="Celebrity name for single video")
    parser.add_argument('--video-url', type=str, help="Video URL for single video")
    parser.add_argument('--custom-script', type=str, help="Custom script for single video")
    args = parser.parse_args()

    logger.info("Starting video generation")
    check_dependencies()
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)
    logger.info(f"Current working directory: {os.getcwd()}")
    log_memory_usage()

    TEMP_VIDEOS_DIR = '/tmp/videos' if os.environ.get('NODE_ENV') == 'production' else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp', 'videos')
    
    os.makedirs(TEMP_VIDEOS_DIR, exist_ok=True)
    logger.info(f"Output directory: {TEMP_VIDEOS_DIR}")

    if args.single:
        if not args.celebrity or not args.video_url:
            logger.error("For --single mode, --celebrity and --video-url are required")
            sys.exit(1)
        celebrity = args.celebrity
        file_name = os.path.basename(args.video_url).replace('.mp4', '') + '.mp4'
        output_path = os.path.join(TEMP_VIDEOS_DIR, file_name)
        custom_script = args.custom_script
        logger.info(f"Generating video for {celebrity} at {output_path}")
        create_video(celebrity, output_path, custom_script)
    else:
        VIDEOS_JSON_URL = 'https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos.json'
        # Fetch videos.json from GitHub
        video_data = {'videos': []}
        try:
            response = requests.get(VIDEOS_JSON_URL, timeout=10)
            response.raise_for_status()
            video_data = response.json()
            logger.info("Fetched videos.json from GitHub")
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                logger.info("videos.json not found in repo, using empty array")
            else:
                logger.error(f"Failed to fetch videos.json: {e}")
                sys.exit(1)
        except Exception as e:
            logger.error(f"Error fetching videos.json: {e}")
            sys.exit(1)

        for video in video_data['videos']:
            celebrity = video['celebrityName']
            file_name = os.path.basename(video['videoUrl']).replace('.mp4', '') + '.mp4'
            output_path = os.path.join(TEMP_VIDEOS_DIR, file_name)
            custom_script = video.get('customScript')
            logger.info(f"Generating video for {celebrity} at {output_path}")
            create_video(celebrity, output_path, custom_script)

if __name__ == "__main__":
    main()
