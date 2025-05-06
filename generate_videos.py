import argparse
import logging
import os
import glob
import random
import traceback
from PIL import Image
import requests
from moviepy.editor import ImageClip, concatenate_videoclips, AudioFileClip
import numpy as np
from datetime import datetime
import sys
import json
from gtts import gTTS
import tempfile

# Configure logging
logging.basicConfig(
    filename='generate_videos.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def download_images(celebrity, num_images=10):
    """Download images for a given celebrity using Unsplash API."""
    access_key = os.getenv('UNSPLASH_ACCESS_KEY')
    if not access_key:
        logging.error("UNSPLASH_ACCESS_KEY environment variable not set")
        raise ValueError("UNSPLASH_ACCESS_KEY environment variable not set")

    url = f"https://api.unsplash.com/search/photos?query={celebrity}&per_page={num_images}&client_id={access_key}"
    try:
        logging.info(f"Requesting images from Unsplash for {celebrity}: {url}")
        response = requests.get(url)
        response.raise_for_status()
        photos = response.json().get('results', [])
        if not photos:
            logging.error(f"No images found for {celebrity} on Unsplash")
            raise ValueError(f"No images found for {celebrity}")
        image_urls = [photo['urls']['regular'] for photo in photos]
        logging.info(f"Downloaded {len(image_urls)} image URLs for {celebrity}")
        return image_urls
    except requests.RequestException as e:
        logging.error(f"Error downloading images for {celebrity}: {str(e)}")
        logging.error(traceback.format_exc())
        raise

def save_images(image_urls, output_dir, celebrity):
    """Save and resize images to 854x480 to reduce memory usage."""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    image_paths = []
    for i, url in enumerate(image_urls):
        try:
            logging.info(f"Downloading image {i+1}/{len(image_urls)}: {url}")
            response = requests.get(url)
            response.raise_for_status()
            image_path = os.path.join(output_dir, f"{celebrity.lower().replace(' ', '_')}_{i}.jpg")
            with open(image_path, 'wb') as f:
                f.write(response.content)
            # Resize image to 854x480
            img = Image.open(image_path)
            img = img.resize((854, 480), Image.LANCZOS)
            img.save(image_path, quality=85)
            img.close()
            Image.open(image_path).verify()  # Verify image integrity
            image_paths.append(image_path)
            logging.info(f"Saved and resized image {i+1}/{len(image_urls)}: {image_path}")
        except (requests.RequestException, Image.UnidentifiedImageError) as e:
            logging.error(f"Error saving image {i+1}: {str(e)}")
            logging.error(traceback.format_exc())
            continue
    if not image_paths:
        logging.error(f"No valid images saved for {celebrity}")
        raise ValueError(f"No valid images saved for {celebrity}")
    return image_paths

def generate_audio_from_script(script, output_dir):
    """Generate audio from script using gTTS and return the file path."""
    if not script:
        logging.info("No script provided for audio generation")
        return None
    try:
        logging.info("Generating audio from script")
        tts = gTTS(text=script, lang='en')
        audio_path = os.path.join(output_dir, f"narration_{random.randint(1000, 9999)}.mp3")
        tts.save(audio_path)
        logging.info(f"Audio generated and saved: {audio_path}")
        return audio_path
    except Exception as e:
        logging.error(f"Error generating audio: {str(e)}")
        logging.error(traceback.format_exc())
        return None

def create_video(image_paths, output_path, celebrity, audio_path=None, duration_per_image=4.3, title="", description="", script=""):
    """Create a video from images with optional audio, optimized for low memory."""
    try:
        clips = []
        for i, image_path in enumerate(image_paths):
            logging.info(f"Processing image {i+1}/{len(image_paths)}: {image_path}")
            img = Image.open(image_path)
            img_array = np.array(img)
            img.close()  # Close image to free memory
            clip = ImageClip(img_array).set_duration(duration_per_image)
            clips.append(clip)
            logging.info(f"Added image {i+1}/{len(image_paths)} to video")

        video = concatenate_videoclips(clips, method="compose")
        for clip in clips:
            clip.close()  # Close clips to free memory
        
        if audio_path:
            try:
                audio = AudioFileClip(audio_path)
                video = video.set_audio(audio)
                logging.info(f"Added audio to video: {audio_path}")
            except Exception as e:
                logging.error(f"Error adding audio: {str(e)}")
                logging.error(traceback.format_exc())

        logging.info(f"Writing video to: {output_path}")
        video.write_videofile(
            output_path,
            codec="libx264",
            audio_codec="aac",
            fps=24,
            preset="ultrafast",  # Optimize for speed
            threads=1,  # Limit CPU usage
            ffmpeg_params=['-vf', 'scale=854:480']  # Ensure 480p output
        )
        logging.info(f"Video written successfully: {output_path}")
    except Exception as e:
        logging.error(f"Error creating video: {str(e)}")
        logging.error(traceback.format_exc())
        raise
    finally:
        video.close()
        if audio_path and 'audio' in locals():
            audio.close()

def generate_single_video(celebrity, output_dir, title, description, script):
    """Generate a single video for a celebrity using a temporary directory."""
    logging.info(f"Generating video for {celebrity}")
    with tempfile.TemporaryDirectory() as temp_dir:
        image_urls = download_images(celebrity)
        image_paths = save_images(image_urls, temp_dir, celebrity)
        
        video_filename = f"{celebrity.lower().replace(' ', '-')}-history.mp4"
        video_path = os.path.join(output_dir, video_filename)
        
        audio_path = generate_audio_from_script(script, temp_dir)
        try:
            create_video(image_paths, video_path, celebrity, audio_path=audio_path, duration_per_image=4.3, title=title, description=description, script=script)
        finally:
            if audio_path and os.path.exists(audio_path):
                try:
                    os.remove(audio_path)
                    logging.info(f"Cleaned up temporary audio file: {audio_path}")
                except Exception as e:
                    logging.error(f"Error cleaning up audio file: {str(e)}")
    
    logging.info(f"Generated video: {video_path}")
    return video_path

def main():
    parser = argparse.ArgumentParser(description="Generate sports celebrity videos.")
    parser.add_argument("--single", help="Generate a single video for a specific celebrity")
    parser.add_argument("--celebrity", help="Name of the celebrity")
    parser.add_argument("--title", help="Title of the video")
    parser.add_argument("--description", help="Description of the video")
    parser.add_argument("--script", help="Custom narration script for the video")
    
    try:
        args = parser.parse_args()
    except Exception as e:
        logging.error(f"Argument parsing failed: {str(e)}")
        logging.error(traceback.format_exc())
        sys.exit(1)

    output_dir = os.path.join(os.getcwd(), "videos")
    
    try:
        if args.single or args.celebrity:
            celebrity = args.single or args.celebrity
            video_path = generate_single_video(
                celebrity,
                output_dir,
                args.title or f"{celebrity} History",
                args.description or f"A short history of {celebrity}",
                args.script or ""
            )
            logging.info(f"Single video generated for {celebrity}: {video_path}")
        else:
            logging.error("No celebrity specified for video generation")
            raise ValueError("No celebrity specified")
    except Exception as e:
        logging.error(f"Script failed: {str(e)}")
        logging.error(traceback.format_exc())
        sys.exit(1)

if __name__ == "__main__":
    main()