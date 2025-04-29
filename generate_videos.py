import json
import os
import argparse
from transformers import pipeline
from moviepy import ImageClip, concatenate_videoclips, AudioFileClip
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

def fetch_images(query, count=2):
    access_key = "LLn6Z2X8dg630nsWa5k96uNtjPPrG8R91oWAE0LpAd8"
    url = f"https://api.unsplash.com/search/photos?query={query}&per_page={count}&client_id={access_key}&w=640&h=360"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        images = [photo['urls']['raw'] + '&w=640&h=360' for photo in data['results']]
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
    
    audio_path = os.path.join(os.path.dirname(output_path), f"{celebrity.replace(' ', '_')}_audio.mp3")
    try:
        # Generate script
        script = generate_script(celebrity, custom_script)
        
        # Create audio
        logger.info(f"Saving audio to: {audio_path}")
        tts = gTTS(script)
        tts.save(audio_path)
        log_memory_usage()
        
        # Fetch images
        image_urls = fetch_images(celebrity)
        clips = []
        temp_image_paths = []
        for i, url in enumerate(image_urls):
            img_path = os.path.join(os.path.dirname(output_path), f"temp_{i}.jpg")
            logger.info(f"Saving image to: {img_path}")
            img_data = requests.get(url, timeout=10).content
            with open(img_path, 'wb') as f:
                f.write(img_data)
            clip = ImageClip(img_path, duration=3)
            clips.append(clip)
            temp_image_paths.append(img_path)
            log_memory_usage()
        
        # Create video
        video = concatenate_videoclips(clips, method="compose")
        audio = AudioFileClip(audio_path)
        final_video = video.with_audio(audio)
        
        # Write video
        logger.info(f"Saving video to: {output_path}")
        final_video.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            fps=15,
            preset='ultrafast',
            threads=1,
            bitrate='500k'
        )
        log_memory_usage()
        
        # Clean up
        logger.info(f"Cleaning up: {audio_path}, {temp_image_paths}")
        audio.close()
        final_video.close()
        for clip in clips:
            clip.close()
        os.remove(audio_path)
        for img_path in temp_image_paths:
            os.remove(img_path)
        
    except Exception as e:
        logger.error(f"Failed to create video for {celebrity}: {e}")
        raise

def main():
    parser = argparse.ArgumentParser(description="Generate sports reels videos")
    parser.add_argument('--single', type=str, help="ID of a single video to generate")
    args = parser.parse_args()

    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)
    logger.info(f"Current working directory: {os.getcwd()}")
    log_memory_usage()

    try:
        with open('./data/videos.json', 'r') as f:
            video_data = json.load(f)
    except FileNotFoundError:
        logger.error("videos.json not found in ./data/")
        exit(1)
    except json.JSONDecodeError:
        logger.error("Invalid JSON in videos.json")
        exit(1)

    output_dir = os.path.join(project_root, "public", "videos")
    os.makedirs(output_dir, exist_ok=True)
    logger.info(f"Output directory: {output_dir}")

    if args.single:
        video = next((v for v in video_data['videos'] if v['id'] == args.single), None)
        if not video:
            logger.error(f"Video with ID {args.single} not found")
            exit(1)
        celebrity = video['celebrityName']
        file_name = os.path.basename(video['videoUrl']).replace('.mp4', '') + '.mp4'
        output_path = os.path.join(output_dir, file_name)
        custom_script = video.get('customScript')
        logger.info(f"Generating video for {celebrity} at {output_path}")
        create_video(celebrity, output_path, custom_script)
    else:
        for video in video_data['videos']:
            celebrity = video['celebrityName']
            file_name = os.path.basename(video['videoUrl']).replace('.mp4', '') + '.mp4'
            output_path = os.path.join(output_dir, file_name)
            custom_script = video.get('customScript')
            logger.info(f"Generating video for {celebrity} at {output_path}")
            create_video(celebrity, output_path, custom_script)

if __name__ == "__main__":
    main()