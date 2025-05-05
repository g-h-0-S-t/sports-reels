import json
import os
import argparse
import sys
from moviepy.editor import ImageClip, concatenate_videoclips, AudioFileClip
from gtts import gTTS
import requests
import logging
import psutil
from PIL import Image
import io

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def log_memory_usage():
    process = psutil.Process()
    mem_info = process.memory_info()
    memory_mb = mem_info.rss / 1024 / 1024
    logger.info(f"Memory usage: {memory_mb:.2f} MB")
    return memory_mb

def log_dir_usage(dir_path):
    total_size = 0
    for dirpath, _, filenames in os.walk(dir_path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            total_size += os.path.getsize(fp)
    logger.info(f"{dir_path} usage: {total_size / 1024 / 1024:.2f} MB")

def check_dependencies():
    dependencies = ['moviepy', 'gtts', 'requests', 'psutil', 'PIL']
    for dep in dependencies:
        try:
            __import__(dep)
            logger.info(f"Dependency {dep} loaded successfully")
        except ImportError as e:
            logger.error(f"Dependency {dep} failed to load: {e}")
            sys.exit(1)

def fetch_images(query, count=10, width=426, height=240):
    access_key = os.environ.get('UNSPLASH_ACCESS_KEY')
    if not access_key:
        logger.error("UNSPLASH_ACCESS_KEY environment variable not set")
        sys.exit(1)
    images = []
    try:
        # Primary query
        url = f"https://api.unsplash.com/search/photos?query={query}&per_page={count}&client_id={access_key}&w={width}&h={height}"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        images = [photo['urls']['raw'] + f'&w={width}&h={height}' for photo in data['results']]
        logger.info(f"Fetched {len(data['results'])} primary images for query: {query}")
        
        # Fallback if needed
        if len(images) < count:
            remaining = count - len(images)
            logger.warning(f"Only {len(images)} images for {query}, fetching {remaining} fallback images")
            fallback_url = f"https://api.unsplash.com/search/photos?query=sports&per_page={remaining}&client_id={access_key}&w={width}&h={height}"
            fallback_response = requests.get(fallback_url, timeout=10)
            fallback_response.raise_for_status()
            fallback_data = fallback_response.json()
            images += [photo['urls']['raw'] + f'&w={width}&h={height}' for photo in fallback_data['results']]
            logger.info(f"Added {len(fallback_data['results'])} fallback images")
        
        return images[:count]
    except Exception as e:
        logger.error(f"Failed to fetch images for {query}: {e}")
        raise

def validate_image(img_data, img_path):
    try:
        img = Image.open(io.BytesIO(img_data))
        img.verify()
        img.close()
        logger.info(f"Validated image: {img_path}")
        return True
    except Exception as e:
        logger.error(f"Invalid image at {img_path}: {e}")
        return False

def create_default_image(img_path, width=426, height=240):
    try:
        img = Image.new('RGB', (width, height), color='gray')
        img.save(img_path, 'JPEG')
        logger.info(f"Created default image: {img_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to create default image {img_path}: {e}")
        return False

def create_video(celebrity, output_path, custom_script=None):
    logger.info(f"Creating video for {celebrity}")
    log_memory_usage()
    log_dir_usage(os.path.dirname(output_path))
    
    audio_path = os.path.join(os.path.dirname(output_path), f"{celebrity.replace(' ', '_')}_audio.mp3")
    temp_image_paths = []
    clips = []
    try:
        # Require custom script
        if not custom_script:
            logger.error(f"No custom script provided for {celebrity}")
            raise ValueError("Custom script is required")
        logger.info(f"Using custom script for {celebrity}")
        
        # Create audio
        logger.info(f"Saving audio to: {audio_path}")
        tts = gTTS(custom_script, slow=False)
        tts.save(audio_path)
        log_memory_usage()
        log_dir_usage(os.path.dirname(output_path))
        
        # Load audio
        audio = AudioFileClip(audio_path)
        audio_duration = audio.duration
        logger.info(f"Audio duration: {audio_duration}s")
        
        # Check memory
        if log_memory_usage() > 300:
            raise MemoryError("Memory usage too high, aborting")
        
        # Fetch images
        image_urls = fetch_images(celebrity, count=10, width=426, height=240)
        num_images = 0
        duration_per_image = audio_duration / 10  # 10 images
        logger.info(f"Total video duration: {audio_duration}s, target 10 images, {duration_per_image}s per image, frames: {int(audio_duration * 12)}")
        for i, url in enumerate(image_urls):
            img_path = os.path.join(os.path.dirname(output_path), f"temp_{i}.jpg")
            logger.info(f"Fetching image {i+1}/10: {url}")
            try:
                img_data = requests.get(url, timeout=10).content
                if not validate_image(img_data, img_path):
                    logger.warning(f"Invalid image {url}, using default")
                    if not create_default_image(img_path):
                        continue
                else:
                    with open(img_path, 'wb') as f:
                        f.write(img_data)
                clip = ImageClip(img_path, duration=duration_per_image)
                clips.append(clip)
                temp_image_paths.append(img_path)
                num_images += 1
                logger.info(f"Added image {num_images}/10: {img_path}")
                log_memory_usage()
                log_dir_usage(os.path.dirname(output_path))
                clip.close()
            except Exception as e:
                logger.error(f"Failed to process image {url}: {e}")
                logger.info(f"Using default image for {img_path}")
                if create_default_image(img_path):
                    clip = ImageClip(img_path, duration=duration_per_image)
                    clips.append(clip)
                    temp_image_paths.append(img_path)
                    num_images += 1
                    logger.info(f"Added default image {num_images}/10: {img_path}")
                    clip.close()
        
        # Require exactly 10 images
        if num_images < 10:
            logger.error(f"Only {num_images} valid images, 10 required")
            raise ValueError("Exactly 10 valid images required")
        
        # Create video
        logger.info("Concatenating 10 clips")
        video = concatenate_videoclips(clips, method="compose")
        final_video = video.set_audio(audio)
        
        # Write video
        logger.info(f"Saving video to: {output_path}")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        try:
            logger.info("Writing video with initial settings")
            final_video.write_videofile(
                output_path,
                codec='libx264',
                audio_codec='aac',
                fps=12,
                preset='ultrafast',
                threads=1,
                bitrate='400k',
                logger='bar',
                temp_audiofile=os.path.join(os.path.dirname(output_path), 'temp_audio.m4a')
            )
            logger.info(f"Video written successfully: {output_path}")
        except Exception as e:
            logger.error(f"Video encoding failed: {e}")
            logger.info("Retrying with minimal settings")
            final_video.write_videofile(
                output_path,
                codec='libx264',
                audio_codec='aac',
                fps=10,
                preset='ultrafast',
                threads=1,
                bitrate='200k',
                logger='bar',
                temp_audiofile=os.path.join(os.path.dirname(output_path), 'temp_audio.m4a')
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
        
    except Exception as e:
        logger.error(f"Failed to create video for {celebrity}: {e}")
        raise
    finally:
        for path in [audio_path] + temp_image_paths:
            if os.path.exists(path):
                os.remove(path)
                logger.info(f"Deleted {path}")

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
        if not args.celebrity or not args.video_url or not args.custom_script:
            logger.error("For --single mode, --celebrity, --video-url, and --custom-script are required")
            sys.exit(1)
        celebrity = args.celebrity
        file_name = os.path.basename(args.video_url).replace('.mp4', '') + '.mp4'
        output_path = os.path.join(TEMP_VIDEOS_DIR, file_name)
        custom_script = args.custom_script
        logger.info(f"Generating video for {celebrity} at {output_path}")
        create_video(celebrity, output_path, custom_script)
    else:
        VIDEOS_JSON_URL = 'https://raw.githubusercontent.com/g-h-0-S-t/sports-reels-videos/main/videos.json'
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
            if not video.get('customScript'):
                logger.warning(f"Skipping {video['celebrityName']}: no custom script")
                continue
            celebrity = video['celebrityName']
            file_name = os.path.basename(video['videoUrl']).replace('.mp4', '') + '.mp4'
            output_path = os.path.join(TEMP_VIDEOS_DIR, file_name)
            custom_script = video['customScript']
            logger.info(f"Generating video for {celebrity} at {output_path}")
            create_video(celebrity, output_path, custom_script)

if __name__ == "__main__":
    main()